'use strict';
/**
 * AP News adapter — transport: provider-required.
 *
 * Verified live 2026-10-05 from a plain server-side fetch (no headless browser):
 *  - https://apnews.com/rss            -> connection reset / HTTP 403 (Akamai bot management)
 *  - https://apnews.com/rsshub        -> HTTP 403
 *  - https://apnews.com/apf-topnews   -> connection reset
 *  - https://apnews.com/hub/world-news (incl. full browser header set) -> HTTP 403
 *  - https://apnews.com/hub/ap-top-news -> HTTP 403
 * apnews.com serves only an Akamai bot-check page (or resets the connection) to
 * non-interactive clients, and its public RSS endpoint is unreachable the same way.
 * There is no unauthenticated public JSON API; AP content APIs require credentials.
 * latest() returns [] rather than hitting blocked endpoints.
 */
const cheerio = require('cheerio'); // eslint-disable-line no-unused-vars

function normalize(raw) {
  return {
    source: 'AP News', sourceUrl: 'https://apnews.com/',
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
  id: 'apnews',
  name: 'AP News',
  country: 'INT',
  category: 'world_news',
  baseUrl: 'https://apnews.com/',
  language: 'en',
  enabled: true,
  priority: 54,
  transport: 'provider-required',
  providerRequiredReason: 'apnews.com returns HTTP 403 / resets connections (Akamai bot management) to all server-side requests including its public RSS endpoint, verified 2026-10-05 even with a full browser header set. No unauthenticated public API is exposed; AP content APIs require credentials.',
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
    throw new Error('AP News scrape unavailable: provider-required (HTTP 403 Akamai bot management on apnews.com). URL: ' + url);
  },
  normalize,
};
