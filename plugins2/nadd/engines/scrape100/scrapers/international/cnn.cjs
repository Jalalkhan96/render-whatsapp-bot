'use strict';
/**
 * CNN adapter — HTML transport (official RSS feeds were discontinued by CNN;
 * rss.cnn.com DNS fails as of 2026-10-05, verified live).
 * Uses server-rendered edition.cnn.com homepage: HTTP 200, no bot block.
 * Verified live 2026-10-05: 70 article anchors matching date-slug pattern
 * ^/YYYY/MM/DD/<section>/<slug> with live headline text inside the anchor.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARTICLE_RE = /^\/20\d\d\/\d\d\/\d\d\/[^/]+\/[^/?#]+/;

function canonicalizeUrl(href, base) {
  if (!href) return null;
  let u;
  try { u = new URL(href, base); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|traffic_source|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.toString();
}

async function fetchWithRetry(url, { timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(1000 * Math.pow(2, i - 1));
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} for ${url}`); continue; }
      return await res.text();
    } catch (e) { clearTimeout(t); lastErr = e; }
  }
  throw lastErr;
}

function normalize(raw) {
  let publishedAt = null;
  if (raw.publishedAt) { const d = new Date(raw.publishedAt); if (!isNaN(d)) publishedAt = d.toISOString(); }
  return {
    source: 'CNN', sourceUrl: 'https://www.cnn.com/',
    category: 'world_news', country: 'INT', language: 'en',
    title: raw.title, description: raw.description, content: raw.description,
    url: raw.url, image: raw.image, author: raw.author,
    publishedAt, updatedAt: null,
    tags: raw.tags || [],
    metadata: { section: raw.section || null, source: 'edition.cnn.com homepage' },
    scrapedAt: new Date().toISOString(),
  };
}

function parseHomepage(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').split('?')[0];
    if (!ARTICLE_RE.test(href)) return;
    const url = canonicalizeUrl(href, baseUrl);
    if (!url || seen.has(url)) return;
    const title = $(el).text().trim().replace(/\s+/g, ' ');
    if (!title || title.length < 8) return;
    seen.add(url);
    const m = href.match(/^\/20\d\d\/\d\d\/\d\d\/([^/]+)\//);
    const img = $(el).find('img').first();
    out.push({
      url, title: title.slice(0, 300), description: null,
      image: img.attr('src') || img.attr('data-src') || null,
      author: null, publishedAt: null,
      section: m ? m[1] : null, tags: m ? [m[1]] : [],
    });
  });
  return out;
}

async function scrapeArticle(url, opts = {}) {
  await sleep(opts.delayMs ?? 1000);
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  let title = null, description = null, image = null, author = null, publishedAt = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const list = Array.isArray(data) ? data : [data];
      for (const d of list) {
        const types = Array.isArray(d['@type']) ? d['@type'] : [d['@type']];
        if (types.some((t) => /NewsArticle|Article/i.test(String(t)))) {
          title = title || d.headline || null;
          description = description || d.description || null;
          image = image || (typeof d.image === 'string' ? d.image : (d.image && d.image.url)) || null;
          author = author || (d.author && (d.author.name || d.author)) || null;
          publishedAt = publishedAt || d.datePublished || null;
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });
  const og = (p) => $(`meta[property="${p}"]`).attr('content') || null;
  title = title || og('og:title') || $('h1').first().text().trim() || null;
  description = description || og('og:description') || $('meta[name="description"]').attr('content') || null;
  image = image || og('og:image');
  publishedAt = publishedAt || $('meta[property="article:published_time"]').attr('content') || null;
  return { url: canonicalizeUrl(url, 'https://edition.cnn.com/'), title, description, image, author, publishedAt };
}

module.exports = {
  id: 'cnn',
  name: 'CNN',
  country: 'INT',
  category: 'world_news',
  baseUrl: 'https://www.cnn.com/',
  language: 'en',
  enabled: true,
  priority: 52,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://edition.cnn.com/',
    search: null,
  },
  selectors: {
    articleAnchor: 'a[href] matching /^\\/20\\d\\d\\/\\d\\d\\/\\d\\d\\/[^/]+\\/[^/?#]+/',
    title: 'anchor text (headline)',
    image: 'anchor img[src] or img[data-src]',
    note: 'CNN discontinued its public RSS feeds (rss.cnn.com unreachable); homepage is server-rendered HTML with date-slug article links, verified live 2026-10-05 (70 anchors).',
  },
  schedule: { frequency: 'high' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    await sleep(opts.delayMs ?? 1000);
    const html = await fetchWithRetry(this.endpoints.latest);
    return parseHomepage(html, this.endpoints.latest).slice(0, limit).map(normalize);
  },

  async search(query, opts = {}) {
    if (!query) return [];
    const q = String(query).toLowerCase();
    const items = await this.latest({ ...opts, limit: 30 });
    return items.filter((r) => r.title.toLowerCase().includes(q));
  },

  async scrape(url, opts = {}) {
    const raw = await scrapeArticle(url, opts);
    return normalize(raw);
  },

  normalize,
};
