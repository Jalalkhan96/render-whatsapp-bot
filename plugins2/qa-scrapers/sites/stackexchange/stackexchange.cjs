'use strict';
/**
 * Stack Exchange network scraper (CommonJS, zero dependencies, Node 18+).
 *
 * Same official Stack Exchange API v2.3 as the Stack Overflow scraper, but
 * targets a different network site: superuser | serverfault | askubuntu | stackapps.
 * No key needed (300 requests/day shared quota). Polite: custom UA + 500ms delay.
 *
 *   node stackexchange.cjs --limit 10
 *   node stackexchange.cjs --limit 10 --site askubuntu --tag boot --sort votes
 *   node stackexchange.cjs --limit 10 --format csv --out out.csv
 */

const UA = 'qa-scrapers/1.0 (+contact: none)';
const API = 'https://api.stackexchange.com/2.3/questions';
const SITES = ['superuser', 'serverfault', 'askubuntu', 'stackapps'];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isoFromEpoch(sec) {
  return sec ? new Date(sec * 1000).toISOString() : null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 429) throw new Error('rate-limited by api.stackexchange.com (HTTP 429) — quota likely exhausted, try later');
  if (res.status === 403) throw new Error('blocked by api.stackexchange.com (HTTP 403)');
  if (!res.ok) throw new Error(`api.stackexchange.com returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('empty response from api.stackexchange.com');
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('non-JSON response from api.stackexchange.com'); }
  if (data.error_id) throw new Error(`Stack Exchange API error ${data.error_id}: ${data.error_message || 'unknown'}`);
  return data;
}

async function scrape({ limit = 10, site = 'superuser', tag = '', sort = 'activity' } = {}) {
  if (!SITES.includes(site)) throw new Error(`unknown site '${site}' (use ${SITES.join('|')})`);
  const allowedSorts = ['activity', 'votes', 'creation'];
  if (!allowedSorts.includes(sort)) throw new Error(`unknown sort '${sort}' (use ${allowedSorts.join('|')})`);
  limit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));

  const items = [];
  let page = 1;
  while (items.length < limit) {
    const size = Math.min(limit - items.length, 100);
    const params = new URLSearchParams({
      order: 'desc', sort, site, pagesize: String(size), page: String(page),
    });
    if (tag) params.set('tagged', tag);
    const data = await fetchJson(`${API}?${params.toString()}`);
    const qs = data.items || [];
    if (!qs.length) break;
    for (const q of qs) {
      items.push({
        question_id: q.question_id,
        site,
        title: q.title || '',
        link: q.link || '',
        score: q.score ?? null,
        answer_count: q.answer_count ?? null,
        view_count: q.view_count ?? null,
        tags: Array.isArray(q.tags) ? q.tags.join(',') : '',
        author: q.owner?.display_name || 'unknown',
        created: isoFromEpoch(q.creation_date),
        is_answered: !!q.is_answered,
      });
      if (items.length >= limit) break;
    }
    if (!data.has_more) break;
    page += 1;
    await sleep(500);
  }
  return { total: items.length, items };
}

// ---- CLI ----
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') o.limit = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--format') o.format = argv[++i];
    else if (a === '--site') o.site = argv[++i];
    else if (a === '--tag') o.tag = argv[++i];
    else if (a === '--sort') o.sort = argv[++i];
  }
  return o;
}

function toCsv(items) {
  const cols = ['question_id', 'site', 'title', 'link', 'score', 'answer_count', 'view_count', 'tags', 'author', 'created', 'is_answered'];
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = (args.format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) { console.error("format must be json|csv"); process.exit(1); }
    try {
      const result = await scrape({ limit: args.limit, site: args.site, tag: args.tag, sort: args.sort });
      const payload = format === 'json' ? JSON.stringify(result, null, 1) + '\n' : toCsv(result.items);
      if (args.out) {
        require('fs').writeFileSync(args.out, payload);
        console.log(`Wrote ${result.total} items -> ${args.out}`);
      } else {
        process.stdout.write(payload);
      }
    } catch (e) {
      console.error('fatal:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { scrape };
