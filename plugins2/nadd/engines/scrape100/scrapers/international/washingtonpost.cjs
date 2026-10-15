'use strict';
/**
 * Washington Post adapter — public RSS headlines only (world section).
 * NEVER bypass the paywall: latest() and search() use only the free RSS feed;
 * scrape() extracts only public metadata (OG/JSON-LD) and never full body text.
 * Verified live 2026-10-05: HTTP 200, RSS 2.0, 6 <item> entries.
 * Fields: title, link, guid, dc:creator (author), pubDate, description.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function canonicalizeUrl(href, base) {
  if (!href) return null;
  let u;
  try { u = new URL(href, base); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
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
        headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
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
    out.push({
      url,
      title,
      description: (it.find('description').first().text() || '').trim().slice(0, 2000) || null,
      image: it.find('media\\:content').attr('url') || it.find('enclosure[type^="image"]').attr('url') || null,
      author: (it.find('dc\\:creator').first().text() || '').trim() || null,
      publishedAt: (it.find('pubDate').first().text() || '').trim() || null,
      tags: it.find('category').map((_, c) => $(c).text().trim()).get().filter(Boolean),
      guid: (it.find('guid').first().text() || '').trim() || null,
    });
  });
  return out;
}

function normalize(raw) {
  let publishedAt = null;
  if (raw.publishedAt) { const d = new Date(raw.publishedAt); if (!isNaN(d)) publishedAt = d.toISOString(); }
  return {
    source: 'Washington Post', sourceUrl: 'https://www.washingtonpost.com/',
    category: 'world_news', country: 'INT', language: 'en',
    title: raw.title, description: raw.description, content: raw.description,
    url: raw.url, image: raw.image, author: raw.author,
    publishedAt, updatedAt: null,
    tags: raw.tags || [],
    metadata: { guid: raw.guid, feed: 'https://feeds.washingtonpost.com/rss/world', paywallNote: 'headlines via free public RSS only; article bodies are paywalled and are not scraped' },
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeArticle(url, opts = {}) {
  // Public metadata only (OpenGraph / JSON-LD). Never attempts to extract paywalled body text.
  await sleep(opts.delayMs ?? 1000);
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  const og = (p) => $(`meta[property="${p}"]`).attr('content') || null;
  let title = null, description = null, image = null, author = null, publishedAt = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const list = Array.isArray(data) ? data : [data];
      for (const d of list) {
        const types = Array.isArray(d['@type']) ? d['@type'] : [d['@type']];
        if (types.some((t) => /NewsArticle/i.test(String(t)))) {
          title = title || d.headline || null;
          description = description || d.description || null;
          image = image || (typeof d.image === 'string' ? d.image : (d.image && d.image.url)) || null;
          author = author || (d.author && (d.author.name || d.author)) || null;
          publishedAt = publishedAt || d.datePublished || null;
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });
  return {
    url: canonicalizeUrl(url, 'https://www.washingtonpost.com/'),
    title: title || og('og:title'), description: description || og('og:description'),
    image: image || og('og:image'), author: author || $('meta[name="author"]').attr('content') || null,
    publishedAt: publishedAt || $('meta[property="article:published_time"]').attr('content') || null,
  };
}

module.exports = {
  id: 'washingtonpost',
  name: 'Washington Post',
  country: 'INT',
  category: 'world_news',
  baseUrl: 'https://www.washingtonpost.com/',
  language: 'en',
  enabled: true,
  priority: 57,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://feeds.washingtonpost.com/rss/world',
    search: null,
  },
  selectors: {
    feedRoot: 'rss > channel',
    item: 'item',
    title: 'title',
    link: 'link',
    description: 'description',
    publishedAt: 'pubDate',
    author: 'dc:creator',
    note: 'Public RSS headlines only (feed currently carries a small item set, verified 6 items on 2026-10-05). Article bodies are paywalled; scrape() reads public metadata only and never bypasses the paywall.',
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
