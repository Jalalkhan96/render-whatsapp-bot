// Nayatel — public packages/prices scraper
// STATUS: provider-required (verified live 2026-10-05).
// nayatel.com pages (/, /internet, /unlimited-bundle) return HTTP 200 but are
// client-rendered Next.js: package prices are NOT in the SSR HTML or flight
// data (no PKR/Rs figures anywhere; only JSON-LD Organization/Product without
// offers). /api/* routes serve the SPA shell, not JSON. No public pricing
// endpoint could be verified.
const cheerio = require('cheerio');

const REASON = 'nayatel.com is client-rendered: package prices are absent from SSR HTML, flight data and JSON-LD (no public pricing figures anywhere on the page), and /api/* serves the SPA shell rather than JSON. Prices require their internal API.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'nayatel',
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
  id: 'nayatel',
  name: 'Nayatel',
  country: 'PK',
  category: 'telecom',
  baseUrl: 'https://nayatel.com/',
  language: 'en',
  enabled: true,
  priority: 50,
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
