// Telemart — electronics/general store scraper
// Verified live 2026-10-05: www.telemart.pk now 301-redirects to https://www.telex.pk/
// (Shopify storefront). Shopify's public /products.json endpoint returns full
// product data (title/handle/vendor/variants price+compare_at_price/images).
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.telex.pk'; // telemart.pk 301 -> telex.pk (verified live)
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

async function fetchJson(url, opts = {}) {
  return JSON.parse(await fetchText(url, { headers: { 'Accept': 'application/json', ...(opts.headers || {}) }, ...opts }));
}

function canon(href) {
  try {
    const u = new URL(href, BASE);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch { return href; }
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

function productToRecord(p) {
  const v = (p.variants && p.variants[0]) || {};
  const price = v.price != null ? Number(v.price) : null;
  const compare = v.compare_at_price != null ? Number(v.compare_at_price) : null;
  const img = p.images && p.images[0];
  return {
    source: 'telemart', category: 'electronics',
    title: p.title || null,
    url: canon(`/products/${p.handle}`),
    price: price != null ? `Rs ${price.toLocaleString('en-PK')}` : null,
    currency: 'PKR',
    oldPrice: compare != null && compare > (price || 0) ? `Rs ${compare.toLocaleString('en-PK')}` : null,
    discount: compare != null && price != null && compare > price ? Math.round((1 - price / compare) * 100) + '% OFF' : null,
    availability: v.available ? 'in_stock' : 'out_of_stock',
    rating: null, reviews: null,
    image: img ? img.src : null,
    brand: p.vendor || null,
    categoryName: p.product_type || null,
    metadata: {
      productId: p.id, handle: p.handle, tags: p.tags,
      pricePKR: price, compareAtPKR: compare,
      publishedAt: p.published_at || null,
    },
  };
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const j = await fetchJson(`${BASE}/products.json?limit=${Math.min(limit, 250)}`);
  await sleep(1200);
  return dedupe((j.products || []).map(productToRecord)).slice(0, limit);
}

async function search(query, opts = {}) {
  const limit = opts.limit || 30;
  const q = String(query || '').toLowerCase();
  // Shopify suggest endpoint is not exposed; pull the public catalog and filter client-side.
  const j = await fetchJson(`${BASE}/products.json?limit=250`);
  await sleep(1200);
  return dedupe((j.products || [])
    .filter((p) => ((p.title || '') + ' ' + (p.vendor || '') + ' ' + (p.product_type || '') + ' ' + (p.tags || '')).toLowerCase().includes(q))
    .map(productToRecord)).slice(0, limit);
}

async function scrape(url, opts = {}) {
  const m = canon(url).match(/\/products\/([a-z0-9-]+)/i);
  if (!m) throw new Error('Telemart scrape() needs a /products/<handle> URL');
  const j = await fetchJson(`${BASE}/products/${m[1]}.js`);
  await sleep(1200);
  const v = (j.variants && j.variants[0]) || {};
  const price = v.price != null ? Number(v.price) / 100 : null; // .js endpoint returns cents
  return normalize({
    source: 'telemart', category: 'electronics',
    title: j.title || null, url: canon(url),
    price: price != null ? `Rs ${price.toLocaleString('en-PK')}` : null,
    currency: 'PKR',
    image: (j.images && j.images[0]) || (j.featured_image) || null,
    brand: j.vendor || null,
    metadata: { productId: j.id, handle: j.handle, pricePKR: price, description: (j.description || '').replace(/<[^>]+>/g, ' ').slice(0, 500) || null },
  });
}

function normalize(raw) {
  return {
    source: 'telemart',
    category: 'electronics',
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
    metadata: { ...(raw.metadata || {}), note: 'telemart.pk now redirects to telex.pk (same store, verified live)', scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'telemart',
  name: 'Telemart',
  country: 'PK',
  category: 'electronics',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 32,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.telex.pk/products.json?limit=<n> (public Shopify JSON)',
    detail: 'https://www.telex.pk/products/<handle>.js (public Shopify JSON)',
    note: 'https://www.telemart.pk/ 301-redirects to https://www.telex.pk/ (verified live 2026-10-05)',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
