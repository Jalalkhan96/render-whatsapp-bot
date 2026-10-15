'use strict';
/**
 * github-trending.cjs — GitHub Trending scraper (Group C, site 1/4).
 *
 * HTML scrape of https://github.com/trending — no API key needed.
 * Selectors verified live 2026-10-03 against the real trending page:
 *   article.Box-row blocks; repo from h2 > a[href="/owner/repo"];
 *   description from p.col-9; language from span[itemprop="programmingLanguage"];
 *   star/fork counts from the /stargazers and /forks links;
 *   period stars from the "N stars today|this week|this month" text.
 *
 * Usage:
 *   node github-trending.cjs --limit 10 --out out.json [--format json|csv]
 *   node github-trending.cjs --lang python --since weekly --limit 25
 *
 * Flags: --lang (default: all languages), --since daily|weekly|monthly (default daily)
 */

const UA = 'qa-scrapers/1.0';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseNum(s) {
  if (s == null) return null;
  const m = String(s).trim().toLowerCase().replace(/,/g, '').match(/^([\d.]+)([km]?)$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === 'k') n *= 1000;
  if (m[2] === 'm') n *= 1000000;
  return Math.round(n);
}

async function scrape(opts = {}) {
  const lang = String(opts.lang || '').trim().toLowerCase();
  const since = String(opts.since || 'daily').toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(since)) {
    throw new Error(`invalid --since '${since}' (use daily|weekly|monthly)`);
  }
  const limit = Math.max(1, parseInt(opts.limit || '25', 10) || 25);

  const url = `https://github.com/trending/${lang ? encodeURIComponent(lang) : ''}?since=${since}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`github.com returned HTTP ${res.status} for ${url}`);
  const html = await res.text();

  const articles = html.match(/<article class="Box-row"[\s\S]*?<\/article>/g) || [];
  if (!articles.length) {
    throw new Error('no trending repo blocks found — GitHub likely changed its markup or blocked the request');
  }

  const items = [];
  for (const a of articles) {
    const hrefM = a.match(/<h2 class="h3 lh-condensed">\s*<a[^>]*href="([^"]+)"/);
    if (!hrefM) continue;
    const repo = hrefM[1].replace(/^\/|\/$/g, '');
    const descM = a.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const langM = a.match(/<span itemprop="programmingLanguage">([^<]+)<\/span>/);
    const starsM = a.match(/\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,.kKmM]+)/);
    const forksM = a.match(/\/forks"[^>]*>[\s\S]*?<\/svg>\s*([\d,.kKmM]+)/);
    const periodM = a.match(/([\d,.]+)\s+stars?\s+(today|this week|this month)/i);
    items.push({
      repo,
      url: `https://github.com/${repo}`,
      description: descM ? stripTags(descM[1]) : null,
      language: langM ? langM[1].trim() : null,
      stars: starsM ? parseNum(starsM[1]) : null,
      forks: forksM ? parseNum(forksM[1]) : null,
      stars_period: periodM ? `${periodM[1]} stars ${periodM[2].toLowerCase()}` : null,
    });
    if (items.length >= limit) break;
  }

  if (!items.length) throw new Error('trending blocks found but no repos could be parsed — markup changed');
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
  const cols = ['repo', 'url', 'description', 'language', 'stars', 'forks', 'stars_period'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = String(args.format || 'json').toLowerCase();
    try {
      const { items, total } = await scrape({ lang: args.lang, since: args.since, limit: args.limit });
      const out = format === 'csv' ? toCsv(items) : JSON.stringify({ total, items }, null, 2);
      if (args.out) {
        require('fs').writeFileSync(String(args.out), out);
        console.log(`wrote ${total} repos -> ${args.out}`);
      } else {
        process.stdout.write(out);
      }
    } catch (e) {
      console.error('error:', e.message);
      process.exit(1);
    }
  })();
}
