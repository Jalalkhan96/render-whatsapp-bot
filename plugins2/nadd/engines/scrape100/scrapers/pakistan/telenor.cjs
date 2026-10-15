// Telenor Pakistan — public offers/prices scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.telenor.com.pk/ returns HTTP 403 to automated clients.
// No public offers/pricing endpoint is reachable without bypassing the block,
// which this system never does.
const cheerio = require('cheerio');

const REASON = 'telenor.com.pk returns HTTP 403 to automated clients; no public offers/pricing endpoint is reachable without bypassing the block, which this system never does.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'telenor',
    category: 'telecom',
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
  id: 'telenor',
  name: 'Telenor Pakistan',
  country: 'PK',
  category: 'telecom',
  baseUrl: 'https://www.telenor.com.pk/',
  language: 'en',
  enabled: true,
  priority: 49,
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
