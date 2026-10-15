// Zameen.com — Pakistan real estate listings scraper
// Verified live 2026-10-05: listing pages return HTTP 200 with property cards
// that carry stable aria-label anchors (Listing link / Price / Location / Beds / Baths / Area / Title).
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
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
    const u = new URL(href, base);
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

// "4.1 Crore" -> 41000000 ; "75 Lac" -> 7500000 ; "85 Thousand" -> 85000
function parseZameenPrice(s) {
  if (!s) return { display: null, numeric: null };
  const display = s.replace(/\s+/g, ' ').trim();
  const m = display.match(/([\d.]+)\s*(Crore|Lac|Lakh|Thousand)/i);
  let numeric = null;
  if (m) {
    const v = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit === 'crore' ? 1e7 : unit === 'thousand' ? 1e3 : 1e5;
    numeric = Math.round(v * mult);
  } else {
    const d = display.replace(/[^\d]/g, '');
    if (d) numeric = parseInt(d, 10);
  }
  return { display, numeric };
}

function parseListingPage(html, base) {
  const $ = cheerio.load(html);
  const out = [];
  $('article').each((_, el) => {
    const card = $(el);
    const link = card.find('a[aria-label="Listing link"]').first();
    const href = link.attr('href');
    if (!href || !/\/Property\//i.test(href)) return;
    const url = canon(href, base);
    const title = (card.find('[aria-label="Title"]').first().text().trim() || link.attr('title') || '').replace(/\s+/g, ' ');
    const priceText = (card.find('[aria-label="Currency"]').first().text().trim() + ' ' + card.find('[aria-label="Price"]').first().text().trim()).trim();
    const { display: price, numeric } = parseZameenPrice(priceText);
    const img = card.find('img[aria-label="Listing photo"]').first();
    const location = card.find('[aria-label="Location"]').first().text().trim().replace(/\s+/g, ' ');
    const beds = card.find('[aria-label="Beds"]').first().text().trim();
    const baths = card.find('[aria-label="Baths"]').first().text().trim();
    const area = card.find('[aria-label="Area"]').first().text().trim();
    const agency = card.find('[aria-label$="badge"]').first().text().trim().replace(/\s+/g, ' ');
    const added = card.find('[aria-label="Listing creation date"]').first().text().trim();
    out.push({
      source: 'zameen', category: 'real_estate',
      title: title || null, url,
      price: price || null, currency: 'PKR',
      oldPrice: null, discount: null, availability: null, rating: null, reviews: null,
      image: img.attr('src') || img.attr('data-src') || null,
      brand: agency || null, categoryName: 'Property',
      metadata: { location, beds, baths, area, pricePKR: numeric, added },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const pages = Math.min(opts.pages || 2, 3);
  const out = [];
  for (let p = 1; p <= pages && out.length < limit; p++) {
    const url = `https://www.zameen.com/Houses_Property/Lahore-1-${p}.html`;
    try {
      const html = await fetchText(url);
      const recs = parseListingPage(html, 'https://www.zameen.com');
      if (!recs.length) break;
      out.push(...recs);
    } catch { break; }
    if (p < pages) await sleep(1200);
  }
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  // Verified listing pattern only exists for Lahore; other queries fall back
  // to fetching latest listings and filtering client-side.
  if (/lahor/.test(q)) return latest(opts);
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => (r.title + ' ' + (r.metadata.location || '')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(canon(url, 'https://www.zameen.com'));
  const $ = cheerio.load(html);
  let ld = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) if (x && /RealEstate|Product|House/i.test(x['@type'] || '')) ld = x;
    } catch {}
  });
  const card = $('article').first();
  const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
  const priceText = (card.find('[aria-label="Currency"]').first().text() + ' ' + card.find('[aria-label="Price"]').first().text()).trim();
  const { display: price, numeric } = parseZameenPrice(priceText);
  return normalize({
    source: 'zameen', category: 'real_estate',
    title, url: canon(url, 'https://www.zameen.com'),
    price: price || (ld && ld.offers && ld.offers.price) || null, currency: 'PKR',
    image: $('meta[property="og:image"]').attr('content') || null,
    metadata: {
      location: card.find('[aria-label="Location"]').first().text().trim() || null,
      beds: card.find('[aria-label="Beds"]').first().text().trim() || null,
      area: card.find('[aria-label="Area"]').first().text().trim() || null,
      pricePKR: numeric,
      description: $('meta[property="og:description"]').attr('content') || null,
    },
  });
}

function normalize(raw) {
  return {
    source: 'zameen',
    category: 'real_estate',
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
    categoryName: raw.categoryName || 'Property',
    metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'zameen',
  name: 'Zameen',
  country: 'PK',
  category: 'real_estate',
  baseUrl: 'https://www.zameen.com/',
  language: 'en',
  enabled: true,
  priority: 27,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.zameen.com/Houses_Property/Lahore-1-{page}.html',
    detail: 'https://www.zameen.com/Property/<slug>-<id>.html',
  },
  selectors: {
    card: 'article',
    link: 'a[aria-label="Listing link"]',
    title: '[aria-label="Title"]',
    price: '[aria-label="Currency"] + [aria-label="Price"] (aria-label="Price")',
    location: '[aria-label="Location"]',
    beds: '[aria-label="Beds"]',
    baths: '[aria-label="Baths"]',
    area: '[aria-label="Area"]',
    image: 'img[aria-label="Listing photo"]',
    agency: '[aria-label$="badge"]',
    added: '[aria-label="Listing creation date"]',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
