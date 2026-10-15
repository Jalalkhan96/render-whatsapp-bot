/**
 * Medium adapter (id 80) — trending / INT
 * Transport: rss (public per-tag RSS feeds) + http (article page HTML for scrape).
 * Verified 2026-10-05 from datacenter IP with browser UA:
 *   - https://medium.com/feed/tag/technology -> HTTP 200, valid RSS 2.0 with items
 *   - article pages carry og:/meta tags and <article> body for scrape()
 * latest({tag}) defaults to 'technology'. search(query) maps the query to a tag
 * feed (single-word tag slug) — honest Medium tag search; no JS search bypass.
 */
'use strict';

const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEFAULT_TAG = 'technology';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/html;q=0.9' }, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

function fromRssItem($, el) {
  const $i = $(el);
  const cats = [];
  $i.find('category').each((_, c) => { const t = $(c).text().trim(); if (t) cats.push(t); });
  return {
    title: $i.find('title').first().text().trim() || null,
    url: ($i.find('link').first().text() || $i.find('guid').first().text() || '').trim() || null,
    description: ($i.find('description').first().text() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) || null,
    author: $i.find('dc\\:creator, creator').first().text().trim() || null,
    publishedAt: $i.find('pubDate').first().text().trim() || null,
    tags: cats,
    image: null,
  };
}

async function tagFeed(tag, maxResults) {
  const slug = String(tag).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const url = `https://medium.com/feed/tag/${slug}`;
  const { status, body } = await fetchText(url);
  if (status !== 200) throw new Error(`Medium tag feed HTTP ${status} for tag "${slug}"`);
  const $ = cheerio.load(body, { xmlMode: true });
  const items = [];
  $('item').each((_, el) => {
    if (items.length >= maxResults) return false;
    const it = fromRssItem($, el);
    if (it.url) items.push(it);
  });
  return items;
}

function normalize(raw) {
  return {
    source: 'medium',
    sourceUrl: raw.url || null,
    category: 'trending',
    title: raw.title || null,
    description: raw.description || null,
    content: raw.content || null,
    url: raw.url || null,
    image: raw.image || null,
    author: raw.author || null,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: raw.tags || [],
    metadata: { score: null, comments: null, engagement: null },
    scrapedAt: new Date().toISOString(),
  };
}

const adapter = {
  id: 'medium',
  name: 'Medium',
  country: 'INT',
  category: 'trending',
  baseUrl: 'https://medium.com/',
  language: 'en',
  enabled: true,
  priority: 80,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    tagRss: 'https://medium.com/feed/tag/{tag}',
    article: '{articleUrl}',
  },
  selectors: {
    rssItem: 'rss > channel > item (title, link, description, dc:creator, pubDate, category)',
    articleTitle: 'meta[property="og:title"], h1',
    articleAuthor: 'meta[name="author"], meta[property="article:author"]',
    articleImage: 'meta[property="og:image"]',
    articleBody: 'article section p',
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const max = Math.min(opts.limit || opts.maxResults || 30, 30);
    const items = await tagFeed(opts.tag || DEFAULT_TAG, max);
    return items.map(normalize);
  },

  async search(query, opts = {}) {
    if (!query || !String(query).trim()) throw new Error('Medium search: query is required');
    const max = Math.min(opts.limit || opts.maxResults || 30, 30);
    const items = await tagFeed(String(query).trim(), max);
    return items.map(normalize);
  },

  async scrape(url, opts = {}) {
    if (!url || !/^https?:\/\//.test(url)) throw new Error('Medium scrape: a valid article URL is required');
    const { status, body } = await fetchText(url);
    if (status !== 200) throw new Error(`Medium article HTTP ${status}`);
    const $ = cheerio.load(body);
    const og = (p) => $(`meta[property="${p}"]`).attr('content') || null;
    const paras = [];
    $('article p, section p').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 20) paras.push(t);
      if (paras.join(' ').length > 4000) return false;
    });
    const raw = {
      title: og('og:title') || $('h1').first().text().trim() || null,
      url,
      description: og('og:description') || $('meta[name="description"]').attr('content') || null,
      content: paras.join('\n\n') || null,
      author: $('meta[name="author"]').attr('content') || og('article:author') || null,
      publishedAt: $('meta[property="article:published_time"]').attr('content') || null,
      tags: [],
      image: og('og:image'),
    };
    return normalize(raw);
  },

  normalize,
  _fetchText: fetchText,
  _tagFeed: tagFeed,
};

module.exports = adapter;
