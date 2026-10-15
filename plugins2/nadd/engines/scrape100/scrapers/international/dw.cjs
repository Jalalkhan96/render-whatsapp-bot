'use strict';
/**
 * DW (Deutsche Welle) adapter — official English top-news feed.
 * The feed is RSS 1.0 (RDF) at https://rss.dw.com/rdf/rss-en-top — HTTP 200 verified 2026-10-05.
 * Fields: title, link (has ?maca=en-rss-en-top-1022-rdf tracking), description,
 * dc:date (publishedAt), dc:subject (tags), dc:language, dwsyn:contentID.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function canonicalizeUrl(href, base) {
  if (!href) return null;
  let u;
  try { u = new URL(href, base); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|maca|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
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
        headers: { 'User-Agent': UA, 'Accept': 'application/rdf+xml, application/rss+xml, application/xml, text/xml, */*' },
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} for ${url}`); continue; }
      return await res.text();
    } catch (e) { clearTimeout(t); lastErr = e; }
  }
  throw lastErr;
}

function parseItems(xml, feedUrl) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('item').each((_, el) => {
    const it = $(el);
    const url = canonicalizeUrl((it.find('link').first().text() || '').trim(), feedUrl);
    const title = (it.find('title').first().text() || '').trim();
    if (!url || !title) return;
    const dcDate = (it.find('dc\\:date').first().text() || '').trim() || null;
    out.push({
      url,
      title,
      description: (it.find('description').first().text() || '').trim().slice(0, 2000) || null,
      image: it.find('media\\:thumbnail').attr('url') || it.find('media\\:content').attr('url') || it.find('enclosure[type^="image"]').attr('url') || null,
      author: null,
      publishedAt: dcDate || (it.find('pubDate').first().text() || '').trim() || null,
      tags: it.find('dc\\:subject').map((_, c) => $(c).text().trim()).get().filter(Boolean),
      contentId: (it.find('dwsyn\\:contentID').first().text() || '').trim() || null,
    });
  });
  return out;
}

function normalize(raw) {
  let publishedAt = null;
  if (raw.publishedAt) { const d = new Date(raw.publishedAt); if (!isNaN(d)) publishedAt = d.toISOString(); }
  return {
    source: 'DW', sourceUrl: 'https://www.dw.com/',
    category: 'world_news', country: 'INT', language: 'en',
    title: raw.title, description: raw.description, content: raw.description,
    url: raw.url, image: raw.image, author: raw.author,
    publishedAt, updatedAt: null,
    tags: raw.tags || [],
    metadata: { contentId: raw.contentId || null, feed: 'https://rss.dw.com/rdf/rss-en-top' },
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeArticle(url, opts = {}) {
  await sleep(opts.delayMs ?? 1000);
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  let title = null, description = null, image = null, author = null, publishedAt = null, content = null;
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
          content = content || d.articleBody || null;
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });
  const og = (p) => $(`meta[property="${p}"]`).attr('content') || null;
  title = title || og('og:title') || $('h1').first().text().trim() || null;
  description = description || og('og:description') || $('meta[name="description"]').attr('content') || null;
  image = image || og('og:image');
  publishedAt = publishedAt || $('meta[property="article:published_time"]').attr('content') || null;
  return { url: canonicalizeUrl(url, 'https://www.dw.com/'), title, description, content: content || description, image, author, publishedAt };
}

module.exports = {
  id: 'dw',
  name: 'DW',
  country: 'INT',
  category: 'world_news',
  baseUrl: 'https://www.dw.com/',
  language: 'en',
  enabled: true,
  priority: 59,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://rss.dw.com/rdf/rss-en-top',
    search: null,
  },
  selectors: {
    feedRoot: 'rdf\\:RDF (RSS 1.0)',
    item: 'item[rdf\\:about]',
    title: 'title',
    link: 'link (?maca tracking stripped)',
    description: 'description',
    publishedAt: 'dc\\:date',
    tags: 'dc\\:subject',
  },
  schedule: { frequency: 'high' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    await sleep(opts.delayMs ?? 1000);
    const xml = await fetchWithRetry(this.endpoints.latest);
    const items = parseItems(xml, this.endpoints.latest);
    const seen = new Set();
    return items
      .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
      .slice(0, limit)
      .map(normalize);
  },

  async search(query, opts = {}) {
    if (!query) return [];
    const q = String(query).toLowerCase();
    const items = await this.latest({ ...opts, limit: 30 });
    return items.filter((r) =>
      (r.title + ' ' + (r.description || '')).toLowerCase().includes(q));
  },

  async scrape(url, opts = {}) {
    const raw = await scrapeArticle(url, opts);
    return normalize(raw);
  },

  normalize,
};
