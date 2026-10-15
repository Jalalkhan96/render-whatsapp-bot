'use strict';
/**
 * Reuters adapter — transport: provider-required.
 *
 * Verified live 2026-10-05 from a plain server-side fetch (no headless browser):
 *  - https://www.reuters.com/rssfeed/worldNews        -> HTTP 401 (anti-bot interstitial page)
 *  - https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-v1 -> HTTP 401
 *  - https://www.reuters.com/sitemap_news_index.xml   -> HTTP 401 (anti-bot interstitial page)
 * Reuters offers no unauthenticated public RSS feed or public JSON API;
 * programmatic access requires a Reuters Connect commercial account / API key.
 * latest() returns [] rather than hitting blocked endpoints.
 */
const cheerio = require('cheerio'); // eslint-disable-line no-unused-vars

function normalize(raw) {
  return {
    source: 'Reuters', sourceUrl: 'https://www.reuters.com/',
    category: 'world_news', country: 'INT', language: 'en',
    title: raw.title || null, description: raw.description || null, content: raw.content || null,
    url: raw.url || null, image: raw.image || null, author: raw.author || null,
    publishedAt: raw.publishedAt || null, updatedAt: raw.updatedAt || null,
    tags: raw.tags || [],
    metadata: {},
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  id: 'reuters',
  name: 'Reuters',
  country: 'INT',
  category: 'world_news',
  baseUrl: 'https://www.reuters.com/',
  language: 'en',
  enabled: true,
  priority: 53,
  transport: 'provider-required',
  providerRequiredReason: 'reuters.com returns HTTP 401 anti-bot interstitial to all server-side requests (RSS feed endpoint, JSON content API, and news sitemap all verified 401 on 2026-10-05). Reuters has no unauthenticated public RSS feed or public JSON API; programmatic access requires a Reuters Connect commercial account / API key.',
  rateLimit: { delayMs: 1000 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: null,
    search: null,
  },
  selectors: {},
  schedule: { frequency: 'high' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return []; },
  async scrape(url /*, opts = {} */) {
    throw new Error('Reuters scrape unavailable: provider-required (HTTP 401 anti-bot on reuters.com; no public RSS/API). URL: ' + url);
  },
  normalize,
};
