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
        if (d && d['@type'] === 'ItemList' && d.itemListElement) {
          for (const it of d.itemListElement) {
            if (it && it.item && it.item.name) out.push(it.item);
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

const DEFAULT_Q = 'laptop';

module.exports = {
  id: 'newegg',
  name: 'Newegg',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.newegg.com/',
  language: 'en',
  enabled: true,
  priority: 97,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.newegg.com/p/pl?d=laptop',
    search: q => 'https://www.newegg.com/p/pl?d=' + encodeURIComponent(q),
  },
  selectors: {
    searchResult: '.item-cell',
    title: '.item-title',
    link: '.item-img, .item-title',
    price: '.price-current',
    image: '.item-img img',
    rating: '.item-rating i',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    const { status, body } = await fetchPage(url, 3);
    if (status !== 200) {
      if (status === 403 || status === 429) {
        module.exports.transport = 'provider-required';
        module.exports.providerRequiredReason = 'anti-bot; needs official Newegg API or provider';
      }
      return [];
    }
    const $ = cheerio.load(body);
    let raw = jsonLdProducts($).map(p => ({ jsonld: p }));
    if (raw.length === 0) {
      raw = [];
      const seen = new Set();
      $('.item-cell').each((_, el) => {
        const e = $(el);
        const titleEl = e.find('.item-title').first();
        const href = titleEl.attr('href');
        const title = titleEl.text().trim();
        if (!href || !title || seen.has(href)) return;
        seen.add(href);
        const cur = e.find('.price-current').first();
        raw.push({
          title,
          url: href,
          price: cur.text().trim().replace(/\s+/g, ''),
          oldPrice: e.find('.price-was').first().text().trim(),
          image: e.find('.item-img img').attr('src'),
          brand: e.find('.item-brand img').attr('title'),
        });
      });
    }
    return raw.slice(0, limit).map(r => this.normalize(r)).filter(Boolean);
  },

  async scrape(url, opts = {}) {
    const { status, body } = await fetchPage(url, 3);
    if (status !== 200) return null;
    const $ = cheerio.load(body);
    const p = jsonLdProducts($).find(x => x['@type'] === 'Product');
    if (p) return this.normalize({ jsonld: p, url });
    const title = $('h1.product-title').text().trim();
    if (!title) return null;
    return this.normalize({
      title,
      url,
      price: $('.price-current').first().text().trim(),
      image: $('.product-view img').first().attr('src'),
    });
  },

  normalize(raw) {
    if (raw.jsonld) {
      const p = raw.jsonld;
      const offers = p.offers || {};
      return {
        source: 'newegg',
        category: 'shopping',
        title: p.name || null,
        url: canon(p.url || raw.url || '', 'https://www.newegg.com/'),
        price: offers.price || null,
        currency: offers.priceCurrency || null,
        oldPrice: null,
        discount: null,
        availability: null,
        rating: p.aggregateRating ? String(p.aggregateRating.ratingValue) : null,
        reviews: p.aggregateRating ? String(p.aggregateRating.reviewCount) : null,
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
        brand: (p.brand && p.brand.name) || p.brand || null,
        categoryName: null,
        metadata: {},
      };
    }
    if (!raw.title) return null;
    return {
      source: 'newegg',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.newegg.com/'),
      price: raw.price || null,
      currency: raw.price && raw.price.includes('$') ? 'USD' : null,
      oldPrice: raw.oldPrice || null,
      discount: null,
      availability: null,
      rating: null,
      reviews: null,
      image: raw.image || null,
      brand: raw.brand || null,
      categoryName: null,
      metadata: {},
    };
  },
};
