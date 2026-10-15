'use strict';
/**
 * hackernews.cjs — Hacker News scraper (official Firebase API, no key).
 *
 *   node hackernews.cjs --limit 10 --feed topstories --out out.json
 *   node hackernews.cjs --limit 5 --feed askstories --format csv --out out.csv
 *
 * Feeds: topstories | newstories | askstories | showstories | jobstories
 * Items are fetched in batches of 5 with a 300ms pause between batches.
 */

const UA = 'qa-scrapers/1.0';
const API = 'https://hacker-news.firebaseio.com/v0';
const FEEDS = ['topstories', 'newstories', 'askstories', 'showstories', 'jobstories'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Hacker News request failed: HTTP ${res.status} for ${url}`);
  return res.json();
}

async function scrape(opts = {}) {
  const feed = String(opts.feed || 'topstories').toLowerCase();
  const limit = Math.max(1, parseInt(opts.limit || 30, 10) || 30);
  if (!FEEDS.includes(feed)) {
    throw new Error(`unknown feed '${feed}' (valid: ${FEEDS.join(', ')})`);
  }

  const ids = await getJson(`${API}/${feed}.json`);
  if (!Array.isArray(ids)) throw new Error('unexpected Hacker News response (expected an id array)');

  const take = ids.slice(0, limit);
  const items = [];
  for (let i = 0; i < take.length; i += 5) {
    const batch = take.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((id) => getJson(`${API}/item/${id}.json`).catch(() => null))
    );
    for (const it of results) {
      if (!it) continue; // deleted / dead item
      items.push({
        id: it.id,
        title: it.title || null,
        url: it.url || null,
        score: it.score ?? null,
        author: it.by || null,
        time: it.time ? new Date(it.time * 1000).toISOString() : null,
        comments: it.descendants ?? null,
        type: it.type || null,
      });
    }
    if (i + 5 < take.length) await sleep(300);
  }

  if (take.length > 0 && items.length === 0) {
    throw new Error('fetched 0 items — the Hacker News API may be down or blocking this network');
  }
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
  const result = await scrape({ limit: args.limit, feed: args.feed });
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
