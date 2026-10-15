// Ufone — public bundles/prices scraper (WordPress site)
// Verified live 2026-10-05: package pages such as
// https://www.ufone.com/prepaid/super-card-family/ return HTTP 200 with one
// <table> per package: rows for Price / Minutes / Internet / SMS / Validity,
// each table preceded by an h2/h3/h4 package-name heading.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.ufone.com';

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

function parseTables(html, pageUrl, pageKind) {
  const $ = cheerio.load(html);
  const out = [];
  $('table').each((_, t) => {
    const table = $(t);
    const rows = {};
    table.find('tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length >= 2) {
        const k = $(cells[0]).text().trim().replace(/\s+/g, ' ');
        const v = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        if (k && v) rows[k] = v;
      }
    });
    const priceKey = Object.keys(rows).find((k) => /^price$/i.test(k));
    if (!priceKey) return; // skip terms/notes tables
    const heading = table.prevAll('h2,h3,h4,h5').first().text().trim().replace(/\s+/g, ' ')
      || table.closest('div').prevAll('h2,h3,h4,h5').first().text().trim().replace(/\s+/g, ' ');
    const price = rows[priceKey];
    const validity = Object.keys(rows).find((k) => /validity/i.test(k));
    out.push({
      source: 'ufone', category: 'telecom',
      title: heading || pageKind, url: pageUrl,
      price: /rs\.?/i.test(price) ? price : `Rs. ${price}`, currency: 'PKR',
      oldPrice: null, discount: null, availability: null, rating: null, reviews: null,
      image: null, brand: 'Ufone', categoryName: pageKind,
      metadata: { details: rows, validity: validity ? rows[validity] : null },
    });
  });
  return dedupe(out);
}

const PAGES = [
  { url: BASE + '/prepaid/super-card-family/', kind: 'Super Card Family' },
  { url: BASE + '/internet-offers/', kind: 'Internet Offers' },
];

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const out = [];
  for (const p of PAGES) {
    if (out.length >= limit) break;
    try {
      const html = await fetchText(p.url);
      out.push(...parseTables(html, p.url, p.kind));
    } catch {}
    await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + JSON.stringify(r.metadata.details || {})).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const kind = $('title').text().trim().split('|')[0].trim() || 'Ufone Package';
  const recs = parseTables(html, url, kind);
  return recs.length ? normalize(recs[0]) : null;
}

function normalize(raw) {
  return {
    source: 'ufone',
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
  id: 'ufone',
  name: 'Ufone',
  country: 'PK',
  category: 'telecom',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 47,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.ufone.com/prepaid/super-card-family/ , https://www.ufone.com/internet-offers/',
  },
  selectors: {
    table: 'table (one per package)',
    name: 'h2/h3/h4 preceding the table',
    rows: 'table tr td (Price / Off Net Minutes / Internet / SMS / Validity)',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
