// Domino's Pakistan — public menu/prices scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.dominos.com.pk/, /menu and /deals all return the same ~3.3 KB SPA
// shell (no menu data in HTML); the menu/deals are rendered client-side from an
// XStak-powered ordering API that is not publicly documented. The sitemap lists
// menu item names (anchors) but no prices.
const cheerio = require('cheerio');

const REASON = "dominos.com.pk is a client-rendered SPA: all pages return an empty app shell and the menu/deals load from an undocumented XStak ordering API requiring location/session context. Menu prices are not publicly reachable without it.";

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'dominos',
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
  id: 'dominos',
  name: "Domino's Pakistan",
  country: 'PK',
  category: 'food',
  baseUrl: 'https://www.dominos.com.pk/',
  language: 'en',
  enabled: true,
  priority: 36,
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
