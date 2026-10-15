// Jazz (jazz.com.pk) — public packages/prices/validity scraper
// Verified live 2026-10-05: https://jazz.com.pk/prepaid/all-in-one-offers returns
// HTTP 200 with .offer-box cards: .offer-box-content-wrap (h5/h4 names,
// #maindiv_value p.srch* spec fields) and .offer-price (e.g. "Rs. 330 (Incl. Tax)").
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://jazz.com.pk';

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

function parseCards(html, pageUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.offer-box').each((_, el) => {
    const box = $(el);
    const wrap = box.find('.offer-box-content-wrap').first();
    const name = [wrap.find('h5.color-grey').first().text().trim(), wrap.find('h4.color-red').first().text().trim()]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const priceText = box.find('.offer-price').first().text().trim().replace(/\s+/g, ' ');
    if (!name || !/Rs\.?/i.test(priceText)) return;
    const specs = {};
    wrap.find('#maindiv_value p').each((_, p) => {
      const cls = $(p).attr('class');
      const t = $(p).text().trim();
      if (cls && t) specs[cls] = t;
    });
    const detailLink = box.find('a[href*="/prepaid/"]').first().attr('href') || null;
    out.push({
      source: 'jazz', category: 'telecom',
      title: name, url: detailLink || pageUrl,
      price: priceText, currency: 'PKR',
      oldPrice: null, discount: null, availability: null, rating: null, reviews: null,
      image: null, brand: 'Jazz', categoryName: 'Prepaid All-in-One Offer',
      metadata: { specs },
    });
  });
  return dedupe(out);
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const url = BASE + '/prepaid/all-in-one-offers';
  const html = await fetchText(url);
  await sleep(1200);
  return parseCards(html, url).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + JSON.stringify(r.metadata.specs || {})).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const title = $('title').text().trim().split('-')[0].trim() || null;
  const mech = [];
  $('.acc-content li').each((_, li) => { const t = $(li).text().trim().replace(/\s+/g, ' '); if (t) mech.push(t); });
  return normalize({
    source: 'jazz', category: 'telecom',
    title, url,
    price: null, currency: 'PKR',
    image: null, brand: 'Jazz', categoryName: 'Offer',
    metadata: { mechanics: mech },
  });
}

function normalize(raw) {
  return {
    source: 'jazz',
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
  id: 'jazz',
  name: 'Jazz',
  country: 'PK',
  category: 'telecom',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 46,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://jazz.com.pk/prepaid/all-in-one-offers',
    detail: 'https://jazz.com.pk/prepaid/<offer-slug>',
  },
  selectors: {
    card: '.offer-box',
    name: '.offer-box-content-wrap h5.color-grey, .offer-box-content-wrap h4.color-red',
    price: '.offer-price',
    specs: '#maindiv_value p (srchdata/srchon_net_mins/srchother_network_mins/srchsms/srchprice)',
    mechanics: '.acc-content li',
  },
  schedule: { frequency: 'medium' },
  latest,
  search,
  scrape,
  normalize,
};
