// PriceOye.pk — electronics price listings scraper
// Verified live 2026-10-05: brand pages (e.g. /mobiles/infinix) and
// /search?q=<terms> return HTTP 200 with .productBox cards (stable classes):
// a.ga-dataset[href], img.product-thumbnail, h4.p-title, .price-box, .price-diff-retail, .price-diff-saving,
// .user-rating-content (rating + review count). Product pages carry JSON-LD Product.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://priceoye.pk';
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

function parsePKR(s) {
  const d = String(s || '').replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : null;
}

function parseCards(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.productBox').each((_, el) => {
    const card = $(el);
    // Two live variants observed: standard (a.ga-dataset, img) and AMP
    // (a.product-card, amp-img). Selectors below cover both.
    const a = card.find('a[href]').first();
    const href = a.attr('href');
    if (!href) return;
    const title = (card.find('.p-title').first().text().trim().replace(/\s+/g, ' ')
      || a.attr('data-product-name') || a.attr('data-vars-value') || '').trim();
    const priceText = card.find('.price-box').first().text().trim().replace(/\s+/g, '');
    const oldText = card.find('.price-diff-retail').first().text().trim().replace(/\s+/g, '');
    const discText = card.find('.price-diff-saving').first().text().trim().replace(/\s+/g, ' ');
    const rating = card.find('.user-rating-content span.h6').first().text().trim();
    const revText = card.find('.user-rating-content span.p6.space, .user-rating-content span.rating-h7').first().text().trim();
    const img = card.find('img.product-thumbnail, amp-img.product-thumbnail').first();
    const imgSrc = img.attr('src') || (img.attr('srcset') || '').split(' ')[0] || null;
    out.push({
      source: 'priceoye', category: 'electronics',
      title: title || null,
      url: canon(href),
      price: priceText || null, currency: 'PKR',
      oldPrice: oldText || null,
      discount: discText || null,
      availability: 'in_stock', rating: rating ? parseFloat(rating) : null,
      reviews: revText ? parseInt(revText.replace(/[^\d]/g, ''), 10) : null,
      image: imgSrc,
      brand: null, categoryName: null,
      metadata: { pricePKR: parsePKR(priceText), oldPricePKR: parsePKR(oldText) },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  // Homepage + popular brand pages carry productBox cards (verified live).
  const urls = [BASE + '/', BASE + '/mobiles/infinix', BASE + '/mobiles/samsung'];
  const out = [];
  for (const url of urls) {
    if (out.length >= limit) break;
    try {
      const html = await fetchText(url);
      out.push(...parseCards(html));
    } catch {}
    await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const limit = opts.limit || 30;
  const q = encodeURIComponent(String(query || '').trim());
  const html = await fetchText(`${BASE}/search?q=${q}`);
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
  if (!ld) throw new Error('PriceOye Product JSON-LD not found');
  const offer = ld.offers ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : null;
  const agg = ld.aggregateRating || {};
  return normalize({
    source: 'priceoye', category: 'electronics',
    title: ld.name || null, url: canon(url),
    price: offer && offer.price ? `Rs ${Number(offer.price).toLocaleString('en-PK')}` : null,
    currency: (offer && offer.priceCurrency) || 'PKR',
    rating: agg.ratingValue ? Number(agg.ratingValue) : null,
    reviews: agg.reviewCount ? Number(agg.reviewCount) : null,
    image: ld.image || null, brand: (ld.brand && ld.brand.name) || null,
    metadata: { pricePKR: offer && offer.price ? Number(offer.price) : null, sku: ld.sku || null },
  });
}

function normalize(raw) {
  return {
    source: 'priceoye',
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
  id: 'priceoye',
  name: 'PriceOye',
  country: 'PK',
  category: 'electronics',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 31,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://priceoye.pk/ , https://priceoye.pk/mobiles/<brand>',
    search: 'https://priceoye.pk/search?q=<terms>',
    detail: 'https://priceoye.pk/<category>/<brand>/<slug> (JSON-LD Product)',
  },
  selectors: {
    card: '.productBox',
    link: '.productBox a[href] (a.ga-dataset standard / a.product-card AMP variant)',
    title: '.p-title (fallback: a[data-product-name] / a[data-vars-value])',
    price: '.price-box',
    oldPrice: '.price-diff-retail',
    discount: '.price-diff-saving',
    rating: '.user-rating-content span.h6',
    reviews: '.user-rating-content span.p6.space (AMP: span.rating-h7)',
    image: 'img.product-thumbnail, amp-img.product-thumbnail',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
