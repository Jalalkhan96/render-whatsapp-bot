// Cheezious — public menu/prices scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://cheezious.com/ and /menu are Next.js pages that return only the app
// shell (~16-20 KB, no menu items, prices or "Rs" text in HTML or flight data);
// the menu is fetched client-side after branch/location selection from an API
// that is not publicly documented (probed /api/menu, /api/products, /api/deals -> 404).
const cheerio = require('cheerio');

const REASON = 'cheezious.com is a client-rendered Next.js app: pages return only the app shell with no menu items or prices in HTML/flight data, and no public menu API endpoint exists (/api/menu, /api/products, /api/deals all 404). Menu data requires their internal ordering API.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'cheezious',
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
  id: 'cheezious',
  name: 'Cheezious',
  country: 'PK',
  category: 'food',
  baseUrl: 'https://cheezious.com/',
  language: 'en',
  enabled: true,
  priority: 37,
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
