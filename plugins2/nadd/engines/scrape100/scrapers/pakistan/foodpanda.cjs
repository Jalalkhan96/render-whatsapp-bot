// Foodpanda Pakistan — public restaurant info scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.foodpanda.pk/ returns HTTP 403 with a PerimeterX ("px-captcha")
// "Access to this page has been denied" challenge page to automated clients.
// No CAPTCHA bypass is attempted. Restaurant listings become available only via
// an official Foodpanda data feed / partnership API key.
const cheerio = require('cheerio');

const REASON = 'foodpanda.pk serves a PerimeterX (px-captcha) "Access to this page has been denied" block page (HTTP 403) to automated clients; no public restaurant-listing endpoint is reachable without bypassing the anti-bot challenge, which this system never does.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'foodpanda',
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
  id: 'foodpanda',
  name: 'Foodpanda Pakistan',
  country: 'PK',
  category: 'food',
  baseUrl: 'https://www.foodpanda.pk/',
  language: 'en',
  enabled: true,
  priority: 34,
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
