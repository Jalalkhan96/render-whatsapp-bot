// Bloomberg adapter (id 88)
// Transport: provider-required. bloomberg.com returns HTTP 403 "Are you a robot?"
// to all non-browser requests (verified live) and sits behind a hard paywall.
// No public headline surface is reachable without bypassing the anti-bot check,
// which this adapter will not do. latest()/search()/scrape() return empty.
module.exports = {
  id: 88,
  name: 'Bloomberg',
  country: 'INT',
  category: 'business',
  baseUrl: 'https://www.bloomberg.com/',
  language: 'en',
  enabled: true,
  priority: 88,
  transport: 'provider-required',
  providerRequiredReason: 'paywall',
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    note: 'bloomberg.com serves HTTP 403 "Are you a robot?" to non-browser clients and enforces a hard paywall; no public content surface is reachable without bypassing the anti-bot check.',
  },
  selectors: {},
  schedule: { frequency: 'low' },

  async latest() { return []; },
  async search() { return []; },
  async scrape() { return null; },

  normalize(raw) {
    if (!raw) return null;
    return {
      source: 'bloomberg',
      sourceUrl: 'https://www.bloomberg.com/',
      category: 'business',
      title: raw.title || null,
      description: raw.description || null,
      content: raw.content || null,
      url: raw.url || null,
      image: raw.image || null,
      author: raw.author || null,
      publishedAt: raw.publishedAt || null,
      updatedAt: raw.updatedAt || null,
      country: 'INT',
      language: 'en',
      tags: raw.tags || [],
      metadata: raw.metadata || {},
      scrapedAt: new Date().toISOString(),
    };
  },
};
