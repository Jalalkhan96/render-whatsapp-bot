// Zong — public packages/prices scraper
// Verified live 2026-10-05: offer pages (e.g. /prepaid/daily-voice-offer,
// /prepaid/sim-lagao-offer, /prepaid/new-sim-offer) return HTTP 200 with an
// offer <table> (ITEMS / OFFER / Price rows) and an h1 offer name.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.zong.com.pk';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { headers = {}, timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.text();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (a < attempts - 1) await sleep(1200 * Math.pow(2, a));
    }
  }
  throw lastErr;
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const k = r.url || r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseOffer(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim().replace(/\s+/g, ' ') || $('title').text().trim().split('|')[0].trim();
  const rows = {};
  $('table').each((_, t) => {
    $(t).find('tr').each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length >= 2) {
        const k = $(cells[0]).text().trim().replace(/\s+/g, ' ');
        const v = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        if (k && v && !/^items$/i.test(k)) rows[k] = v;
      }
    });
  });
  const priceKey = Object.keys(rows).find((k) => /^price$/i.test(k));
  if (!priceKey) return null;
  const price = rows[priceKey];
  return {
    source: 'zong', category: 'telecom',
    title: title || null, url,
    price: /rs\.?/i.test(price) ? price : `Rs. ${price}`, currency: 'PKR',
    oldPrice: null, discount: null, availability: null, rating: null, reviews: null,
    image: null, brand: 'Zong', categoryName: 'Prepaid Offer',
    metadata: { details: rows },
  };
}

// Offer pages verified HTTP 200 live 2026-10-05.
const OFFER_URLS = [
  BASE + '/prepaid/daily-voice-offer',
  BASE + '/prepaid/sim-lagao-offer',
  BASE + '/prepaid/new-sim-offer',
];

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const out = [];
  for (const url of OFFER_URLS) {
    if (out.length >= limit) break;
    try {
      const html = await fetchText(url);
      const rec = parseOffer(html, url);
      if (rec) out.push(rec);
    } catch {}
    await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 30 });
  return recs.filter((r) => ((r.title || '') + ' ' + JSON.stringify(r.metadata.details || {})).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(url);
  const rec = parseOffer(html, url);
  return rec ? normalize(rec) : null;
}

function normalize(raw) {
  return {
    source: 'zong',
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
  id: 'zong',
  name: 'Zong',
  country: 'PK',
  category: 'telecom',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 48,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    offers: 'https://www.zong.com.pk/prepaid/daily-voice-offer , /prepaid/sim-lagao-offer , /prepaid/new-sim-offer',
  },
  selectors: {
    name: 'h1',
    rows: 'table tr td (ITEMS / OFFER / Price)',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
