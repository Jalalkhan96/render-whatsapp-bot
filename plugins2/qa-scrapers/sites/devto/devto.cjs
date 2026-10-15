'use strict';
/**
 * devto.cjs — DEV Community scraper (official REST API, no key).
 *
 *   node devto.cjs --limit 10 --out out.json
 *   node devto.cjs --limit 10 --tag python --rising --format csv --out out.csv
 *
 * Flags: --tag <name> (filter by tag), --rising (state=rising articles)
 */

const UA = 'qa-scrapers/1.0';
const API = 'https://dev.to/api/articles';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrape(opts = {}) {
  const limit = Math.max(1, Math.min(1000, parseInt(opts.limit || 30, 10) || 30));
  const params = new URLSearchParams({ per_page: String(limit) });
  if (opts.tag) params.set('tag', String(opts.tag));
  if (opts.rising) params.set('state', 'rising');

  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`DEV API request failed: HTTP ${res.status} for ${API}?${params}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('unexpected DEV API response (expected an article array)');

  const items = data.slice(0, limit).map((a) => ({
    id: a.id,
    title: a.title || null,
    description: a.description || null,
    url: a.url || null,
    tags: Array.isArray(a.tag_list) ? a.tag_list.join(', ') : null,
    author: (a.user && a.user.username) || null,
    reactions: a.positive_reactions_count ?? null,
    comments_count: a.comments_count ?? null,
    published_at: a.published_at || null,
    reading_time_minutes: a.reading_time_minutes ?? null,
  }));

  await sleep(300); // polite pause
  return { total: items.length, items };
}

function toCsv(items) {
  if (!items.length) return '';
  const cols = Object.keys(items[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const format = String(args.format || 'json').toLowerCase();
  const result = await scrape({ limit: args.limit, tag: args.tag, rising: args.rising });
  const out = format === 'csv' ? toCsv(result.items) : JSON.stringify(result, null, 2);
  if (args.out) {
    require('fs').writeFileSync(args.out, out);
    console.log(`wrote ${result.total} items -> ${args.out}`);
  } else {
    process.stdout.write(out);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('error:', e.message); process.exit(1); });
}

module.exports = { scrape };
