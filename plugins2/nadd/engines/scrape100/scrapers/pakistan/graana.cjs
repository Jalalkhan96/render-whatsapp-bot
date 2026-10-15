// Graana.com — Pakistan real estate listings scraper
// Verified live 2026-10-05: homepage embeds __NEXT_DATA__ JSON with
// pageProps.recentRent / recentSale -> city buckets -> properties[] (full data).
// Property detail pages embed the same JSON at pageProps.data.
// NOTE: agent phone numbers are present in the JSON but are NEVER collected.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.graana.com';
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

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Verified homepage anchors look like /property/20-marla-lower-portion-rent-f-6-islamabad-1557403/
function idToUrlMap(html) {
  const $ = cheerio.load(html);
  const map = {};
  $('a[href*="/property/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/property\/.+-(\d+)\/?$/);
    if (m) map[m[1]] = canon(href, BASE);
  });
  return map;
}

function camelToSlug(s) {
  return String(s || '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function propertyToRecord(p, urlMap) {
  const id = String(p.id);
  let url = urlMap[id];
  if (!url) {
    const slug = [p.size, p.sizeUnit, camelToSlug(p.subtype), p.purpose,
      (p.area && p.area.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      (p.city && p.city.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), id]
      .filter(Boolean).join('-').replace(/-+/g, '-');
    url = `${BASE}/property/${slug}/`;
  }
  const img = p.propertyImages && p.propertyImages[0];
  const title = p.customTitle || `${p.size || ''} ${p.sizeUnit || ''} ${p.subtype || p.type || ''} for ${p.purpose || ''} in ${(p.area && p.area.name) || ''}, ${(p.city && p.city.name) || ''}`.replace(/\s+/g, ' ').trim();
  return {
    source: 'graana', category: 'real_estate',
    title, url,
    price: p.price != null ? `PKR ${Number(p.price).toLocaleString('en-PK')}` : null,
    currency: 'PKR',
    oldPrice: null, discount: null, availability: p.status || null, rating: null, reviews: null,
    image: img ? canon(img.url.startsWith('http') ? img.url : BASE + img.url, BASE) : null,
    brand: null, categoryName: p.type || 'Property',
    metadata: {
      propertyId: id, purpose: p.purpose, subtype: p.subtype,
      beds: p.bed, baths: p.bath,
      area: p.size && p.sizeUnit ? `${p.size} ${p.sizeUnit}` : null,
      areaName: p.area && p.area.name, city: p.city && p.city.name,
      pricePKR: p.price != null ? Number(p.price) : null,
      listedAt: p.createdAt || null,
    },
  };
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const html = await fetchText(BASE + '/');
  const j = nextData(html);
  if (!j || !j.props || !j.props.pageProps) throw new Error('Graana __NEXT_DATA__ not found');
  const pp = j.props.pageProps;
  const urlMap = idToUrlMap(html);
  const out = [];
  for (const bucket of [pp.recentRent, pp.recentSale]) {
    if (!bucket) continue;
    for (const k of Object.keys(bucket)) {
      for (const p of bucket[k].properties || []) {
        out.push(propertyToRecord(p, urlMap));
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  await sleep(1200);
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => (
    (r.title || '') + ' ' + (r.metadata.areaName || '') + ' ' + (r.metadata.city || '') + ' ' + (r.metadata.subtype || '')
  ).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(canon(url, BASE));
  const j = nextData(html);
  const data = j && j.props && j.props.pageProps && j.props.pageProps.data;
  if (!data) throw new Error('Graana property JSON not found on page');
  return normalize(propertyToRecord(data, idToUrlMap(html)));
}

function normalize(raw) {
  return {
    source: 'graana',
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
  id: 'graana',
  name: 'Graana',
  country: 'PK',
  category: 'real_estate',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 28,
  transport: 'json',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.graana.com/ (embedded __NEXT_DATA__ pageProps.recentRent/recentSale)',
    detail: 'https://www.graana.com/property/<slug>-<id>/ (embedded __NEXT_DATA__ pageProps.data)',
  },
  selectors: {
    embeddedJson: 'script#__NEXT_DATA__ (application/json)',
    propertyLink: 'a[href*="/property/"]',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
