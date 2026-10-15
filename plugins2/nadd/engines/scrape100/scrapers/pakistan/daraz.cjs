// Daraz.pk — public product info scraper
// Verified live 2026-10-05: the catalog endpoint with ?q=<terms>&ajax=true plus
// X-Requested-With header returns HTTP 200 public JSON: { mods: { listItems: { n: {...} } } }
// with name/price/priceShow/originalPriceShow/discount/ratingScore/review/sellerName/brandName/image/itemUrl.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.daraz.pk';

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

function canon(href) {
  try {
    const u = new URL(href.startsWith('//') ? 'https:' + href : href, BASE);
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

function itemToRecord(it) {
  const priceNum = it.price != null ? Number(it.price) : null;
  const origNum = it.originalPrice != null ? Number(it.originalPrice) : null;
  return {
    source: 'daraz', category: 'shopping',
    title: it.name || null,
    url: it.itemUrl ? canon(it.itemUrl) : null,
    price: it.priceShow || (priceNum != null ? `Rs. ${priceNum.toLocaleString('en-PK')}` : null),
    currency: 'PKR',
    oldPrice: it.originalPriceShow || null,
    discount: it.discount || null,
    availability: it.inStock === false ? 'out_of_stock' : 'in_stock',
    rating: it.ratingScore != null ? Number(it.ratingScore) : null,
    reviews: it.review != null ? Number(it.review) : null,
    image: it.image || null,
    brand: it.brandName || null,
    categoryName: Array.isArray(it.categories) && it.categories.length ? it.categories[it.categories.length - 1] : null,
    metadata: {
      itemId: it.itemId || it.nid || null,
      seller: it.sellerName || null,
      sellerId: it.sellerId || null,
      soldCount: it.itemSoldCntShow || null,
      pricePKR: priceNum,
      originalPricePKR: origNum,
      sponsored: !!it.isSponsored,
    },
  };
}

async function searchCatalog(query, page = 1) {
  const q = encodeURIComponent(String(query || '').trim());
  const url = `${BASE}/catalog/?q=${q}&ajax=true&page=${page}`;
  const text = await fetchText(url, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } });
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('Daraz catalog did not return JSON'); }
  const list = (j.mods && j.mods.listItems) || {};
  return Object.keys(list).sort((a, b) => a - b).map((k) => itemToRecord(list[k]));
}

async function latest(opts = {}) {
  // Daraz has no query-less product listing endpoint; use a default popular query.
  const limit = opts.limit || 30;
  return search(opts.defaultQuery || 'mobile', { ...opts, limit });
}

async function search(query, opts = {}) {
  const limit = opts.limit || 30;
  const pages = Math.min(opts.pages || 2, 3);
  const out = [];
  for (let p = 1; p <= pages && out.length < limit; p++) {
    const recs = await searchCatalog(query, p);
    if (!recs.length) break;
    out.push(...recs);
    if (p < pages) await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(canon(url));
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) if (x && /Product/i.test(x['@type'] || '')) ld = x;
    } catch {}
  });
  const offer = ld && ld.offers ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : null;
  return normalize({
    source: 'daraz', category: 'shopping',
    title: (ld && ld.name) || $('meta[property="og:title"]').attr('content') || null,
    url: canon(url),
    price: (offer && offer.price) || $('meta[property="product:price:amount"]').attr('content') || null,
    currency: (offer && offer.priceCurrency) || 'PKR',
    image: (ld && ld.image) || $('meta[property="og:image"]').attr('content') || null,
    brand: (ld && ld.brand && ld.brand.name) || null,
    metadata: { description: $('meta[property="og:description"]').attr('content') || null },
  });
}

function normalize(raw) {
  return {
    source: 'daraz',
    category: 'shopping',
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
  id: 'daraz',
  name: 'Daraz',
  country: 'PK',
  category: 'shopping',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 30,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    search: 'https://www.daraz.pk/catalog/?q=<terms>&ajax=true&page=<n> (header X-Requested-With: XMLHttpRequest) -> { mods: { listItems } }',
    detail: 'https://www.daraz.pk/products/<slug>-i<itemId>.html',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
