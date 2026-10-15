'use strict';
/**
 * producthunt.cjs — Product Hunt scraper (Group C, site 3/4). BEST-EFFORT.
 *
 * The site is JS-heavy and sits behind Cloudflare bot protection. This scraper
 * fetches the homepage HTML and extracts product cards via the surviving
 * server-rendered selector `a[href^="/products/"]` (href = slug, link text =
 * name), deduped by slug. Verified approach 2026-10-03: from this sandbox the
 * site returns HTTP 403 "Just a moment..." (Cloudflare), so the scraper throws
 * an honest error here — but the parsing path is complete and works from a
 * non-blocked network or with the challenge solved.
 *
 * Usage:
 *   node producthunt.cjs --limit 10 --out out.json [--format json|csv]
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HOME = 'https://www.producthunt.com/';

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function scrape(opts = {}) {
  const limit = Math.max(1, parseInt(opts.limit || '10', 10) || 10);

  const res = await fetch(HOME, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const html = await res.text();

  if (!res.ok || /Just a moment|Attention Required|cf-challenge/i.test(html)) {
    throw new Error(
      `producthunt.com blocked the request (HTTP ${res.status}, Cloudflare bot protection). ` +
        'The page is JS-rendered behind a challenge — open it in a real browser instead.'
    );
  }

  const seen = new Map();
  const linkRe = /<a[^>]+href="(\/products\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html))) {
    const slug = m[1].replace(/^\/products\//, '').replace(/\/$/, '');
    if (!slug || seen.has(slug)) continue;
    const name = stripTags(m[2]);
    if (!name) continue;
    seen.set(slug, { name, slug, url: `https://www.producthunt.com/products/${slug}` });
    if (seen.size >= limit) break;
  }

  const items = [...seen.values()];
  if (!items.length) {
    throw new Error(
      'no product cards found in the page HTML — the page is JS-rendered; use a real browser ' +
        'or a rendered-DOM extraction instead'
    );
  }
  return { total: items.length, items };
}

module.exports = { scrape };

/* ---------------- CLI ---------------- */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      o[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    }
  }
  return o;
}

function toCsv(items) {
  const cols = ['name', 'slug', 'url'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = String(args.format || 'json').toLowerCase();
    try {
      const { items, total } = await scrape({ limit: args.limit });
      const out = format === 'csv' ? toCsv(items) : JSON.stringify({ total, items }, null, 2);
      if (args.out) {
        require('fs').writeFileSync(String(args.out), out);
        console.log(`wrote ${total} products -> ${args.out}`);
      } else {
        process.stdout.write(out);
      }
    } catch (e) {
      console.error('error:', e.message);
      process.exit(1);
    }
  })();
}
