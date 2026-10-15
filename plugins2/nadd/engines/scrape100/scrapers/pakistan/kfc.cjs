// KFC Pakistan — public menu/prices/deals scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.kfcpakistan.com/ and /menu/ return a minimal React SPA shell
// (~3-4 KB, no menu data in HTML or JSON-LD); the menu is rendered client-side
// from an API whose base URL is obfuscated inside the JS bundle and not
// publicly documented. No public menu/prices endpoint could be verified.
const cheerio = require('cheerio');

const REASON = 'kfcpakistan.com is a client-rendered React SPA: pages return only an app shell with no menu data in HTML/JSON-LD, and the menu API base URL is obfuscated in the JS bundle with no publicly documented endpoint. Menu/prices require the official KFC ordering API or partnership feed.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'kfc',
    category: 'food',
    title: raw.title || null,
    url: raw.url || null,
    price: raw.price || null,
    currency: raw.currency || 'PKR',
    oldPrice: raw.oldPrice || null,
    discount: raw.discount || null,
    availability: raw.availability || null,
    rating: raw.rating || null,
    reviews: raw.reviews || null,
    image: raw.image || null,
    brand: raw.brand || null,
    categoryName: raw.categoryName || null,
    metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'kfc',
  name: 'KFC Pakistan',
  country: 'PK',
  category: 'food',
  baseUrl: 'https://www.kfcpakistan.com/',
  language: 'en',
  enabled: true,
  priority: 35,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {},
  selectors: {},
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
