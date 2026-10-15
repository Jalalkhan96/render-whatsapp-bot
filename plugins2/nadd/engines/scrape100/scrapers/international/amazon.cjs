const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchPage(url, attempts = 3) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      const body = await res.text();
      return { status: res.status, body, finalUrl: res.url };
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 1200 * 2 ** i));
    }
  }
  throw last;
}

function jsonLdProducts($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const d of items) {
        if (d && (d['@type'] === 'ItemList' || d['@type'] === 'SearchResultsPage') && d.itemListElement) {
          for (const it of d.itemListElement) {
            if (it && it.item && (it.item['@type'] === 'Product' || it.item.name)) out.push(it.item);
          }
        } else if (d && d['@type'] === 'Product') {
          out.push(d);
        }
      }
    } catch (_) { /* ignore */ }
  });
  return out;
}

function canon(u, base) {
  try { return new URL(u, base).toString().split('#')[0]; } catch (_) { return u; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEFAULT_Q = 'laptop';

async function runSearch(query, limit = 30) {
  const url = module.exports.endpoints.search(query);
  const { status, body } = await fetchPage(url, 2);
  if (status === 503 || status === 403 || /robot check|captcha|Enter the characters you see/i.test(body)) {
    return { blocked: true, status };
  }
  if (status !== 200) return { blocked: status === 429 || status === 403, status, raw: [] };
  const $ = cheerio.load(body);
  // Amazon blocks datacenter traffic with a CAPTCHA/robot-check page; if we ever get
  // through, try JSON-LD first, then known search-result selectors.
  let raw = jsonLdProducts($).map(p => ({ jsonld: p }));
  if (raw.length === 0) {
    $('div[data-component-type="s-search-result"]').each((_, el) => {
      const e = $(el);
      const a = e.find('h2 a, a.a-link-normal.s-no-outline').first();
      const href = a.attr('href');
      if (!href || href.includes('/s?')) return;
      raw.push({
        title: e.find('h2 span').first().text().trim(),
        url: href,
        price: e.find('.a-price .a-offscreen').first().text().trim(),
        oldPrice: e.find('.a-price.a-text-price .a-offscreen').first().text().trim(),
        rating: e.find('.a-icon-star-small .a-icon-alt, i.a-icon-star-small .a-icon-alt').first().text().trim(),
        image: e.find('img.s-image').attr('src'),
      });
    });
  }
  raw = raw.slice(0, limit);
  await sleep(1500);
  return { status, raw };
}

module.exports = {
  id: 'amazon',
  name: 'Amazon',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.amazon.com/',
  language: 'en',
  enabled: true,
  priority: 91,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.amazon.com/s?k=laptop',
    search: q => 'https://www.amazon.com/s?k=' + encodeURIComponent(q),
  },
  selectors: {
    searchResult: 'div[data-component-type="s-search-result"]',
    title: 'h2 span',
    link: 'h2 a',
    price: '.a-price .a-offscreen',
    image: 'img.s-image',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const { raw, blocked, status } = await runSearch(query, opts.limit || 30);
    if (blocked) {
      module.exports.transport = 'provider-required';
      module.exports.providerRequiredReason = 'anti-bot/CAPTCHA; needs official Product Advertising API or provider';
      return [];
    }
    if (!raw) return [];
    return raw.map(r => this.normalize(r)).filter(Boolean);
  },

  async scrape(url, opts = {}) {
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200) return null;
    const $ = cheerio.load(body);
    const p = jsonLdProducts($).find(x => x.jsonld && x.jsonld['@type'] === 'Product');
    if (p) return this.normalize({ jsonld: p.jsonld, url });
    const title = $('#productTitle').text().trim();
    if (!title) return null;
    return this.normalize({
      title,
      url,
      price: $('.a-price .a-offscreen').first().text().trim(),
      image: $('#landingImage').attr('src'),
    });
  },

  normalize(raw) {
    if (raw.jsonld) {
      const p = raw.jsonld;
      const offers = p.offers || {};
      return {
        source: 'amazon',
        category: 'shopping',
        title: p.name || null,
        url: canon(p.url || raw.url || '', 'https://www.amazon.com/'),
        price: offers.price || null,
        currency: offers.priceCurrency || null,
        oldPrice: null,
        discount: null,
        availability: offers.availability ? offers.availability.split('/').pop() : null,
        rating: p.aggregateRating ? String(p.aggregateRating.ratingValue) : null,
        reviews: p.aggregateRating ? String(p.aggregateRating.reviewCount) : null,
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
        brand: (p.brand && p.brand.name) || p.brand || null,
        categoryName: p.category || null,
        metadata: { sku: p.sku || null },
      };
    }
    if (!raw.title) return null;
    return {
      source: 'amazon',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.amazon.com/'),
      price: raw.price || null,
      currency: raw.price && raw.price.startsWith('$') ? 'USD' : null,
      oldPrice: raw.oldPrice || null,
      discount: null,
      availability: null,
      rating: raw.rating ? raw.rating.split(' ')[0] : null,
      reviews: null,
      image: raw.image || null,
      brand: null,
      categoryName: null,
      metadata: {},
    };
  },
};
