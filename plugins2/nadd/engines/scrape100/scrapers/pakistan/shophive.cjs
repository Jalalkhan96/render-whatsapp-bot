// ShopHive.com — electronics store scraper (Magento storefront)
// Verified live 2026-10-05: category pages (e.g. /apple/iphone, /latest-products)
// return HTTP 200 with standard Magento .product-item cards carrying
// .price-wrapper[data-price-amount][data-price-type], .product-item-link, img.product-image-photo.
// Search: /catalogsearch/result/?q=<terms> (verified live).
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.shophive.com';
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

function parseCards(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.product-item').each((_, el) => {
    const item = $(el);
    const link = item.find('a.product-item-link, a.product-item-photo').first();
    const href = link.attr('href') || item.find('.product-item-link').attr('href');
    if (!href) return;
    const title = item.find('.product-item-link').first().text().trim().replace(/\s+/g, ' ');
    let finalPrice = null, oldPrice = null;
    item.find('.price-wrapper').each((_, w) => {
      const type = $(w).attr('data-price-type');
      const amt = parseFloat($(w).attr('data-price-amount'));
      if (type === 'finalPrice') finalPrice = amt;
      if (type === 'oldPrice') oldPrice = amt;
    });
    if (finalPrice == null) return; // skip non-product tiles
    const img = item.find('img.product-image-photo').first();
    out.push({
      source: 'shophive', category: 'electronics',
      title: title || null, url: canon(href),
      price: `Rs ${finalPrice.toLocaleString('en-PK')}`, currency: 'PKR',
      oldPrice: oldPrice && oldPrice > finalPrice ? `Rs ${oldPrice.toLocaleString('en-PK')}` : null,
      discount: oldPrice && oldPrice > finalPrice ? Math.round((1 - finalPrice / oldPrice) * 100) + '% OFF' : null,
      availability: 'in_stock', rating: null, reviews: null,
      image: img.attr('src') || null,
      brand: null, categoryName: null,
      metadata: { pricePKR: finalPrice, oldPricePKR: oldPrice },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const html = await fetchText(BASE + '/latest-products');
  await sleep(1200);
  return parseCards(html).slice(0, limit);
}

async function search(query, opts = {}) {
  const limit = opts.limit || 30;
  const q = encodeURIComponent(String(query || '').trim());
  const html = await fetchText(`${BASE}/catalogsearch/result/?q=${q}`);
  await sleep(1200);
  return parseCards(html).slice(0, limit);
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
  const priceText = $('[data-price-type="finalPrice"]').first().text().trim() || $('.price-wrapper[data-price-type="finalPrice"] .price').first().text().trim();
  const priceNum = parseFloat(($('[data-price-type="finalPrice"]').first().attr('data-price-amount')) || 'NaN');
  return normalize({
    source: 'shophive', category: 'electronics',
    title: (ld && ld.name) || $('meta[property="og:title"]').attr('content') || $('.page-title').first().text().trim() || null,
    url: canon(url),
    price: priceText || null, currency: 'PKR',
    image: (ld && ld.image) || $('meta[property="og:image"]').attr('content') || null,
    brand: (ld && ld.brand && ld.brand.name) || null,
    metadata: {
      pricePKR: isNaN(priceNum) ? null : priceNum,
      sku: (ld && ld.sku) || $('[itemprop="sku"]').first().text().trim() || null,
      description: $('meta[property="og:description"]').attr('content') || null,
    },
  });
}

function normalize(raw) {
  return {
    source: 'shophive',
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
    metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'shophive',
  name: 'ShopHive',
  country: 'PK',
  category: 'electronics',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 33,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.shophive.com/latest-products',
    search: 'https://www.shophive.com/catalogsearch/result/?q=<terms>',
    category: 'https://www.shophive.com/<category>/<subcategory> (e.g. /apple/iphone)',
  },
  selectors: {
    card: '.product-item',
    link: 'a.product-item-link, a.product-item-photo',
    price: '.price-wrapper[data-price-type="finalPrice"] (data-price-amount)',
    oldPrice: '.price-wrapper[data-price-type="oldPrice"]',
    image: 'img.product-image-photo',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
