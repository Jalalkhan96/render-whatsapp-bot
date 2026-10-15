// ICC (International Cricket Council) — fixtures/rankings/news scraper
// Verified live 2026-10-05: the homepage returns HTTP 200 with news links
// (/news/<slug>); article pages carry full JSON-LD NewsArticle
// (headline, description, image, datePublished, author).
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.icc-cricket.com';
const TRACKING = /^(utm_|fbclid|gclid|mc_|igshid|vero_|yclid)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { headers = {}, timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.text();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (a < attempts - 1) await sleep(1200 * Math.pow(2, a));
    }
  }
  throw lastErr;
}

function canon(href) {
  try {
    const u = new URL(href, BASE);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch { return href; }
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const k = r.url || r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseArticle(html, url) {
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) if (x && /NewsArticle/i.test(x['@type'] || '')) ld = x;
    } catch {}
  });
  if (!ld) return null;
  const img = ld.image;
  const image = Array.isArray(img) ? img[0] : (img && img.url) || img || null;
  return {
    source: 'icc', sourceUrl: BASE + '/',
    category: 'cricket',
    title: ld.headline || null,
    description: ld.description || null,
    content: null,
    url,
    image: image || null,
    author: (ld.author && (ld.author.name || (Array.isArray(ld.author) && ld.author[0] && ld.author[0].name))) || null,
    publishedAt: ld.datePublished || null,
    updatedAt: ld.dateModified || null,
    country: 'INT', language: 'en', tags: [],
    metadata: {},
    scrapedAt: new Date().toISOString(),
  };
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const home = await fetchText(BASE + '/');
  const $ = cheerio.load(home);
  const links = [];
  $('a[href*="/news/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (href && /\/news\/[a-z0-9-]+$/i.test(href)) links.push(canon(href));
  });
  const uniq = [...new Set(links)].slice(0, Math.min(limit, 8));
  const out = [];
  for (const url of uniq) {
    try {
      const html = await fetchText(url);
      const rec = parseArticle(html, url);
      if (rec && rec.title) out.push(rec);
      if (out.length >= limit) break;
    } catch {}
    await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 8 });
  return recs.filter((r) => ((r.title || '') + ' ' + (r.description || '')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(canon(url));
  const rec = parseArticle(html, canon(url));
  if (!rec) throw new Error('ICC NewsArticle JSON-LD not found on page');
  return normalize(rec);
}

function normalize(raw) {
  return {
    source: 'icc',
    sourceUrl: raw.sourceUrl || BASE + '/',
    category: raw.category || 'cricket',
    title: raw.title || null,
    description: raw.description || null,
    content: raw.content || null,
    url: raw.url || null,
    image: raw.image || null,
    author: raw.author || null,
    publishedAt: raw.publishedAt || null,
    updatedAt: raw.updatedAt || null,
    country: raw.country || 'INT',
    language: raw.language || 'en',
    tags: raw.tags || [],
    metadata: { ...(raw.metadata || {}), scrapedAt: raw.scrapedAt || new Date().toISOString() },
  };
}

module.exports = {
  id: 'icc',
  name: 'ICC',
  country: 'INT',
  category: 'cricket',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 45,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.icc-cricket.com/ (news links) -> https://www.icc-cricket.com/news/<slug> (JSON-LD NewsArticle)',
  },
  selectors: {
    newsLink: 'a[href*="/news/"]',
    articleJsonLd: 'script[type="application/ld+json"] (@type NewsArticle)',
  },
  schedule: { frequency: 'high' },
  latest,
  search,
  scrape,
  normalize,
};
