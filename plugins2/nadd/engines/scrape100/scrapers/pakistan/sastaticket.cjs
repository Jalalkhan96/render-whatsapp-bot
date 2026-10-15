// Sastaticket.pk — public travel packages scraper
// Verified live 2026-10-05: /pages/umrah-packages and /pages/holiday-packages
// return HTTP 200 with server-rendered .pkgBox cards: a.dynamicLink[data-title],
// .imgArea img, h6 (duration + .rating-value), .hotel-info li inclusions,
// and per-person prices like "262,600 PKR / Person" in card text.
// Only public package info is collected — no booking, no personal data.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.sastaticket.pk';
const TRACKING = /^(utm_|fbclid|gclid|mc_|igshid|vero_|yclid)/i;

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
    const k = r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseCards(html, pageUrl, pageKind) {
  const $ = cheerio.load(html);
  const out = [];
  $('.pkgBox').each((_, el) => {
    const card = $(el);
    const a = card.find('a.dynamicLink').first();
    const title = (a.attr('data-title') || '').trim();
    if (!title) return;
    const h6 = card.find('h6').first();
    const duration = h6.clone().children().remove().end().text().trim().replace(/\s+/g, ' ');
    const rating = card.find('.rating-value').first().text().trim();
    const inclusions = [];
    card.find('.hotel-info li').each((_, li) => {
      const t = $(li).text().trim().replace(/\s+/g, ' ');
      if (t) inclusions.push(t);
    });
    const text = card.text().replace(/\s+/g, ' ');
    // prices like "262,600 PKR / Person"
    const prices = [...text.matchAll(/([\d,]+)\s*PKR\s*\/\s*Person/gi)].map((m) => parseInt(m[1].replace(/,/g, ''), 10));
    const img = card.find('.imgArea img').first().attr('src') || null;
    out.push({
      source: 'sastaticket', category: 'travel',
      title, url: pageUrl,
      price: prices.length ? `PKR ${Math.min(...prices).toLocaleString('en-PK')} / Person` : null,
      currency: 'PKR',
      oldPrice: null, discount: null, availability: null,
      rating: rating ? parseFloat(rating) : null, reviews: null,
      image: img, brand: 'Sastaticket', categoryName: pageKind,
      metadata: { duration, inclusions, priceOptionsPKR: prices, rating },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const pages = [
    { url: BASE + '/pages/umrah-packages', kind: 'Umrah Packages' },
    { url: BASE + '/pages/holiday-packages', kind: 'Holiday Packages' },
  ];
  const out = [];
  for (const p of pages) {
    if (out.length >= limit) break;
    try {
      const html = await fetchText(p.url);
      out.push(...parseCards(html, p.url, p.kind));
    } catch {}
    await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + (r.metadata.inclusions || []).join(' ')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const m = String(url).match(/\/pages\/([a-z-]+)/);
  const kind = m ? m[1].replace(/-/g, ' ') : 'Packages';
  const html = await fetchText(url);
  const recs = parseCards(html, url, kind);
  return recs.length ? normalize(recs[0]) : null;
}

function normalize(raw) {
  return {
    source: 'sastaticket',
    category: 'travel',
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
  id: 'sastaticket',
  name: 'Sastaticket',
  country: 'PK',
  category: 'travel',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 38,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.sastaticket.pk/pages/umrah-packages , https://www.sastaticket.pk/pages/holiday-packages',
  },
  selectors: {
    card: '.pkgBox',
    title: 'a.dynamicLink[data-title]',
    duration: '.pkgBox h6',
    rating: '.rating-value',
    inclusions: '.hotel-info li',
    image: '.imgArea img',
  },
  schedule: { frequency: 'low' },
  latest,
  search,
  scrape,
  normalize,
};
