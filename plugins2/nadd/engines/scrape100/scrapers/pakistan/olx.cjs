// OLX Pakistan — public classifieds listings scraper
// Verified live 2026-10-05: category/search pages return HTTP 200 with listing
// <article> cards carrying stable aria-label anchors (Price / Title / Cover photo).
// Only public listing data is collected — no personal/contact data.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.olx.com.pk';
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

function canon(href, base) {
  try {
    const u = new URL(href, base || BASE);
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

function parseListingPage(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('article').has('a[href*="/item/"]').each((_, el) => {
    const card = $(el);
    const link = card.find('a[href*="/item/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const url = canon(href, BASE);
    const title = (card.find('[aria-label="Title"]').first().text().trim() || link.attr('title') || '').replace(/\s+/g, ' ');
    const price = card.find('[aria-label="Price"]').first().text().trim().replace(/\s+/g, ' ') || null;
    const img = card.find('img[aria-label="Cover photo"]').first();
    const locDate = card.find('[aria-label="Location"], [aria-label="Date"], [data-aut-id="item-location"]').first().text().trim();
    // location/date line: "Kacheri Road, Multan•1 hour ago"
    const m = card.text().replace(/\s+/g, ' ').match(/([A-Za-z ,-]+?)\s*[•·]\s*(\d+\s+\w+\s+ago|Today|Yesterday)/);
    out.push({
      source: 'olx', category: 'shopping',
      title: title || null, url,
      price: price || null, currency: 'PKR',
      oldPrice: null, discount: null, availability: null, rating: null, reviews: null,
      image: img.attr('src') || null,
      brand: null, categoryName: null,
      metadata: {
        location: m ? m[1].trim() : (locDate || null),
        listedAgo: m ? m[2].trim() : null,
        featured: card.find('[aria-label="Featured"]').length > 0,
      },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  // Verified live: mobiles category listing (OLX category URLs end without trailing slash)
  const html = await fetchText(BASE + '/mobile-phones_c1411');
  await sleep(1200);
  return parseListingPage(html).slice(0, limit);
}

async function search(query, opts = {}) {
  const limit = opts.limit || 30;
  const q = encodeURIComponent(String(query || '').trim().replace(/\s+/g, '-'));
  // Verified live 2026-10-05: /items/q-<terms> returns HTTP 200 with listing cards
  const html = await fetchText(`${BASE}/items/q-${q}`);
  await sleep(1200);
  return parseListingPage(html).slice(0, limit);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(canon(url, BASE));
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) if (x && /Product/i.test(x['@type'] || '')) ld = x;
    } catch {}
  });
  const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || null;
  const price = (ld && ld.offers && (ld.offers.price || (Array.isArray(ld.offers) && ld.offers[0] && ld.offers[0].price))) || $('[data-aut-id="itemPrice"]').first().text().trim() || null;
  return normalize({
    source: 'olx', category: 'shopping',
    title, url: canon(url, BASE),
    price: price || null, currency: 'PKR',
    image: $('meta[property="og:image"]').attr('content') || null,
    metadata: {
      description: $('meta[property="og:description"]').attr('content') || null,
      location: $('[data-aut-id="item-location"]').first().text().trim() || null,
    },
  });
}

function normalize(raw) {
  return {
    source: 'olx',
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
  id: 'olx',
  name: 'OLX Pakistan',
  country: 'PK',
  category: 'shopping',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 29,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.olx.com.pk/mobile-phones_c1411',
    search: 'https://www.olx.com.pk/items/q-<terms>',
    detail: 'https://www.olx.com.pk/item/<slug>-iid-<id>',
  },
  selectors: {
    card: 'article:has(a[href*="/item/"])',
    link: 'a[href*="/item/"]',
    title: '[aria-label="Title"]',
    price: '[aria-label="Price"]',
    image: 'img[aria-label="Cover photo"]',
    featured: '[aria-label="Featured"]',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
