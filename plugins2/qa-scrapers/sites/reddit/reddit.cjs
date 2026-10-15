'use strict';
/**
 * Reddit scraper (CommonJS, zero dependencies, Node 18+).
 *
 * Uses Reddit's public JSON endpoints — no key, no login needed.
 * Polite: custom UA + 500ms delay between sequential requests.
 *
 *   node reddit.cjs --limit 10
 *   node reddit.cjs --limit 10 --sub webdev --sort top --out out.json
 *   node reddit.cjs --limit 10 --format csv --out out.csv
 */

const UA = 'qa-scrapers/1.0 (+contact: none)';
const BASE = 'https://www.reddit.com';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isoFromEpoch(sec) {
  return sec ? new Date(sec * 1000).toISOString() : null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 429) throw new Error('rate-limited by reddit.com (HTTP 429) — slow down and retry later');
  if (res.status === 403) throw new Error('blocked by reddit.com (HTTP 403) — check User-Agent / network');
  if (res.status === 404) throw new Error(`subreddit not found (HTTP 404): ${url}`);
  if (!res.ok) throw new Error(`reddit.com returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('empty response from reddit.com');
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('non-JSON response from reddit.com (bot-wall?)'); }
  if (data.error) throw new Error(`Reddit API error: ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

function mapPost(p) {
  const d = p.data || {};
  return {
    id: d.id || '',
    title: d.title || '',
    author: d.author || 'unknown',
    score: d.score ?? null,
    num_comments: d.num_comments ?? null,
    url: d.url || '',
    permalink: d.permalink ? BASE + d.permalink : '',
    created_utc: isoFromEpoch(d.created_utc),
    selftext_preview: (d.selftext || '').slice(0, 300),
  };
}

async function scrape({ limit = 10, sub = 'programming', sort = 'hot' } = {}) {
  const allowedSorts = ['hot', 'new', 'top', 'rising'];
  if (!allowedSorts.includes(sort)) throw new Error(`unknown sort '${sort}' (use ${allowedSorts.join('|')})`);
  sub = String(sub || 'programming').replace(/^r\//, '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(sub)) throw new Error(`invalid subreddit name '${sub}'`);
  limit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));

  const items = [];
  let after = null;
  while (items.length < limit) {
    const size = Math.min(limit - items.length, 100);
    const params = new URLSearchParams({ limit: String(size) });
    if (after) params.set('after', after);
    const url = `${BASE}/r/${sub}/${sort}.json?${params.toString()}`;
    const data = await fetchJson(url);
    const children = data?.data?.children || [];
    if (!children.length) break;
    for (const c of children) {
      items.push(mapPost(c));
      if (items.length >= limit) break;
    }
    after = data?.data?.after;
    if (!after) break;
    await sleep(500);
  }
  if (!items.length) throw new Error(`no posts returned for r/${sub} (subreddit may be empty or restricted)`);
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
    else if (a === '--sub') o.sub = argv[++i];
    else if (a === '--sort') o.sort = argv[++i];
  }
  return o;
}

function toCsv(items) {
  const cols = ['id', 'title', 'author', 'score', 'num_comments', 'url', 'permalink', 'created_utc', 'selftext_preview'];
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = (args.format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) { console.error("format must be json|csv"); process.exit(1); }
    try {
      const result = await scrape({ limit: args.limit, sub: args.sub, sort: args.sort });
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
