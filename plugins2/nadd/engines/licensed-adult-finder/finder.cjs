'use strict';
/* licensed-adult-finder — legal-lane adult video search over official developer APIs.
 * 18+ gate, registry-only sources, metadata + official links, NO bulk downloads,
 * anime/hentai/doujinshi permanently excluded.
 *
 *   node finder.cjs --i-am-18 --search "query" [--per-page 30] [--page 1]
 *                    [--order latest|mostviewed|toprated|longest]
 *                    [--out results.json] [--format json|csv|txt]
 *                    [--no-attribution] [--attribution-file log.json]
 *   node finder.cjs --i-am-18 --trending [--per-page 30]
 *   node finder.cjs --i-am-18 --video <id>
 *   node finder.cjs --sources
 *   node finder.cjs --help
 */

const fs = require('fs');
const agegate = require('./lib/agegate.cjs');
const registry = require('./lib/registry.cjs');
const eporner = require('./lib/eporner.cjs');
const license = require('./lib/license.cjs');
const { rank } = require('./lib/rank.cjs');
const { dedup } = require('./lib/dedup.cjs');
const store = require('./lib/store.cjs');

const HELP = `
licensed-adult-finder v1.0 — official-API adult video search (18+)

  --i-am-18            REQUIRED. Confirms you are 18 or older. (Or set LAF_I_AM_ADULT=1)
  --search "query"     Search videos by keywords
  --trending           Most-viewed videos right now
  --video <id>         Metadata for one video id
  --per-page N         Results per page, 1-100 (default 30)
  --page N             Page number (default 1)
  --order <o>          latest | mostviewed | toprated | longest (default latest)
  --format <f>         Output format: json | csv | txt (default json)
  --out <file>         Write results to file (default: print to stdout)
  --no-attribution    Skip the attribution log entry
  --attribution-file   Custom attribution log path
  --sources            List registered sources and their status
  --help               This text

Rules baked in: official developer APIs only (scrapers refused at registration),
metadata + official links only (no --download exists on purpose),
anime/hentai/doujinshi queries permanently refused, unknown licenses never free.
`.trim();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(name); }

function toCsv(results) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['provider', 'id', 'title', 'url', 'embed_url', 'duration', 'views', 'rating', 'added', 'provider_terms'];
  const rows = results.map(r => [r.provider, r.id, r.title, r.url, r.embed_url, r.duration, r.views, r.rating, r.added, r.license.provider_terms].map(esc).join(','));
  return head.join(',') + '\n' + rows.join('\n');
}

function toTxt(results) {
  return results.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.duration} | ${r.views} views | rating ${r.rating} | added ${r.added}\n   terms: ${r.license.provider_terms}`
  ).join('\n\n');
}

async function runSearch({ query, perPage, page, order }) {
  const qv = registry.validateQuery(query);
  if (!qv.ok) { console.error(qv.error); process.exit(2); }
  const res = await eporner.search({ query, perPage, page, order });
  if (!res.ok) { console.error('Search failed:', res.error); process.exit(1); }
  const lic = license.attachAll(dedup(res.results));
  if (!lic.ok) { console.error(lic.error); process.exit(1); }
  const ranked = rank(lic.results, query);
  return { query, provider: 'eporner', meta: { total_count: res.total_count, total_pages: res.total_pages, page: res.page }, results: ranked };
}

async function main() {
  if (has('--help') || process.argv.length <= 2) { console.log(HELP); return; }

  if (has('--sources')) {
    for (const s of registry.list()) {
      console.log(`${s.id}  [${s.kind}]  status=${s.status}  verified=${s.verified_at}`);
      console.log(`  ${s.name} — ${s.base}`);
      console.log(`  docs: ${s.docs} | terms: ${s.terms} | auth: ${s.auth}`);
      console.log(`  notes: ${s.notes}\n`);
    }
    console.log('Banned source kinds (permanent): ' + registry.BANNED_KINDS.join(', '));
    return;
  }

  const gate = agegate.check(process.argv);
  if (!gate.ok) { console.error(gate.message); process.exit(2); }

  const perPage = Math.min(100, Math.max(1, parseInt(arg('--per-page') || '30', 10) || 30));
  const page = Math.max(1, parseInt(arg('--page') || '1', 10) || 1);
  const order = arg('--order') || 'latest';
  const format = (arg('--format') || 'json').toLowerCase();

  let payload;
  if (has('--video')) {
    const id = arg('--video');
    if (!id) { console.error('--video needs an id'); process.exit(2); }
    const res = await eporner.byId(id);
    if (!res.ok) { console.error('Lookup failed:', res.error); process.exit(1); }
    const lic = license.attachAll(res.results);
    if (!lic.ok) { console.error(lic.error); process.exit(1); }
    payload = { query: null, provider: 'eporner', results: lic.results };
  } else if (has('--trending')) {
    payload = await runSearch({ query: '', perPage, page, order: 'mostviewed' });
  } else if (has('--search')) {
    const query = arg('--search');
    if (!query) { console.error('--search needs a query'); process.exit(2); }
    payload = await runSearch({ query, perPage, page, order });
  } else {
    console.error('Give me --search, --trending, or --video. See --help.');
    process.exit(2);
  }

  if (!has('--no-attribution')) {
    const f = store.append({ query: payload.query, provider: payload.provider, results: payload.results, file: arg('--attribution-file') });
    console.error(`attribution logged -> ${f}`);
  }

  let out;
  if (format === 'csv') out = toCsv(payload.results);
  else if (format === 'txt') out = toTxt(payload.results);
  else out = JSON.stringify(payload, null, 2);

  const outFile = arg('--out');
  if (outFile) { fs.writeFileSync(outFile, out); console.error(`wrote ${payload.results.length} results -> ${outFile}`); }
  else console.log(out);
}

main().catch(e => { console.error('fatal:', e.message || e); process.exit(1); });
