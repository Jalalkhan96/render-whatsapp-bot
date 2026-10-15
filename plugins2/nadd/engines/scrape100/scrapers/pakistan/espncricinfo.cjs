// ESPNcricinfo — cricket news scraper (official RSS)
// Verified live 2026-10-05: https://www.espncricinfo.com/rss/content/story/feeds/0.xml
// returns HTTP 200 RSS 2.0 with items (title/link/description/pubDate/dc:creator/media:thumbnail).
// The HTML site and hs-consumer-api are Cloudflare/403-guarded from automated
// clients, so the official public RSS feed is the supported transport.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.espncricinfo.com';
const FEED = BASE + '/rss/content/story/feeds/0.xml';

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

function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const k = r.url || r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('item').each((_, el) => {
    const it = $(el);
    const title = it.find('title').first().text().trim();
    const link = it.find('link').first().text().trim();
    if (!title || !link) return;
    const desc = it.find('description').first().text().trim().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) || null;
    const pub = it.find('pubDate').first().text().trim();
    const author = it.find('dc\\:creator, creator').first().text().trim() || null;
    const img = it.find('media\\:thumbnail, thumbnail').first().attr('url') || it.find('enclosure').first().attr('url') || null;
    out.push({
      source: 'espncricinfo', sourceUrl: BASE + '/',
      category: 'cricket',
      title, description: desc, content: null, url: link, image: img, author,
      publishedAt: pub ? new Date(pub).toISOString() : null,
      updatedAt: null, country: 'INT', language: 'en', tags: [],
      metadata: {},
      scrapedAt: new Date().toISOString(),
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const xml = await fetchText(FEED);
  await sleep(1200);
  return parseFeed(xml).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + (r.description || '')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  // Article HTML pages are Cloudflare-guarded (HTTP 403) — only the public RSS
  // feed is reachable, so per-article scrape degrades to null rather than throwing.
  let html;
  try { html = await fetchText(url); }
  catch { return null; }
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) if (x && /NewsArticle|Article/i.test(x['@type'] || '')) ld = x;
    } catch {}
  });
  return normalize({
    source: 'espncricinfo', sourceUrl: BASE + '/',
    category: 'cricket',
    title: (ld && ld.headline) || $('meta[property="og:title"]').attr('content') || null,
    description: (ld && ld.description) || $('meta[property="og:description"]').attr('content') || null,
    url,
    image: (ld && ld.image) || $('meta[property="og:image"]').attr('content') || null,
    author: (ld && ld.author && ld.author.name) || null,
    publishedAt: (ld && ld.datePublished) || null,
    country: 'INT', language: 'en', tags: [],
    metadata: {},
  });
}

function normalize(raw) {
  return {
    source: 'espncricinfo',
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
  id: 'espncricinfo',
  name: 'ESPNcricinfo',
  country: 'INT',
  category: 'cricket',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 43,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml (official public RSS)',
  },
  selectors: {
    item: 'rss > channel > item',
    title: 'item > title', link: 'item > link', description: 'item > description',
    publishedAt: 'item > pubDate', author: 'item > dc:creator', image: 'item > media:thumbnail',
  },
  schedule: { frequency: 'high' },
  latest,
  search,
  scrape,
  normalize,
};
