'use strict';
/**
 * lobsters.cjs — Lobste.rs story scraper (HTML scrape, no API).
 *
 *   node lobsters.cjs --limit 10 --out out.json
 *   node lobsters.cjs --limit 10 --page 2 --format csv --out out.csv
 *
 * Flags: --page <n> (front page is 1; page 2 -> https://lobste.rs/page/2)
 *
 * Regexes below were written against the real markup fetched 2026-10-03:
 * each story is `<li id="story_<shortid>" ...>` containing
 *   <a class="u-url" href="URL">TITLE</a>
 *   <a class="domain" ...>domain.tld</a>            (missing on some posts)
 *   <a class="upvoter" ...>SCORE</a>
 *   <a class="u-author h-card ..." ...>submitter</a>
 *   <a ... aria-level="2" href="/s/<id>/...">N comments</a>  ("no comments" -> 0)
 */

const UA = 'qa-scrapers/1.0';
const BASE = 'https://lobste.rs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function first(re, text) {
  const m = text.match(re);
  return m ? m[1] : null;
}

function parseBlock(block) {
  const url = first(/<a class="u-url" href="([^"]+)"[^>]*>/, block);
  const rawTitle = first(/<a class="u-url" href="[^"]+"[^>]*>([^<]+)<\/a>/, block);
  const domain = first(/<a class="domain"[^>]*>([^<]+)<\/a>/, block);
  const scoreRaw = first(/<a class="upvoter"[^>]*>\s*(\d+)\s*<\/a>/, block);
  const submitter = first(/u-author h-card[^"]*" href="[^"]*">([^<]+)<\/a>/, block);
  const commentsPath = first(/aria-level="2" href="([^"]*)"/, block);
  const commentsLabel = first(/aria-level="2" href="[^"]*">\s*([^<]*?)\s*</, block);

  if (!url || !rawTitle) return null; // not a parseable story block

  let comments = null;
  if (commentsLabel) {
    const n = commentsLabel.match(/(\d+)\s+comment/);
    comments = n ? parseInt(n[1], 10) : 0; // "no comments" -> 0
  }

  return {
    title: decodeEntities(rawTitle.trim()),
    url,
    domain: domain ? domain.trim() : null,
    score: scoreRaw !== null ? parseInt(scoreRaw, 10) : null,
    submitter: submitter ? submitter.trim() : null,
    comments_count: comments,
    comments_url: commentsPath ? BASE + commentsPath : null,
  };
}

async function scrape(opts = {}) {
  const limit = Math.max(1, parseInt(opts.limit || 30, 10) || 30);
  const page = Math.max(1, parseInt(opts.page || 1, 10) || 1);
  const url = page === 1 ? `${BASE}/` : `${BASE}/page/${page}`;

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Lobste.rs request failed: HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (!html.includes('id="story_')) {
    throw new Error('page markup did not contain any story blocks — the site layout may have changed');
  }

  const items = [];
  const chunks = html.split('<li id="story_').slice(1);
  for (const chunk of chunks) {
    if (items.length >= limit) break;
    const block = chunk.split('\n</li>')[0]; // story's closing </li> sits on its own line; inner tag <li>s do not
    const story = parseBlock(block);
    if (story) items.push(story);
  }

  if (items.length === 0) {
    throw new Error('parsed 0 stories — the site markup may have changed; regexes need updating');
  }

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
  const result = await scrape({ limit: args.limit, page: args.page });
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
