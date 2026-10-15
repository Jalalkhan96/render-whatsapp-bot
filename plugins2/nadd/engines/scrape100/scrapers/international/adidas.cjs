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

const DEFAULT_Q = 'shoes';

module.exports = {
  id: 'adidas',
  name: 'Adidas',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.adidas.com/',
  language: 'en',
  enabled: true,
  priority: 99,
  transport: 'provider-required',
  providerRequiredReason: 'anti-bot (Akamai, request blocked/timeout); needs official adidas API or provider',
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.adidas.com/us/search?q=shoes',
    search: q => 'https://www.adidas.com/us/search?q=' + encodeURIComponent(q),
  },
  selectors: {
    // Verified only if the live fetch returns parseable markup; see smoke test.
    searchResult: '[data-testid="plp-product-card"]',
    title: '[data-testid="product-card-title"]',
    link: 'a[data-testid="product-card-title-link"]',
    price: '[data-testid="primary-price"]',
    image: 'img[data-testid="product-card-primary-image"]',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    let res;
    try {
      res = await fetchPage(url, 2);
    } catch (e) {
      // adidas hangs/timeouts datacenter requests (Akamai anti-bot); do not retry harder.
      return [];
    }
    const { status, body } = res;
    if (status !== 200 || /captcha|robot|access denied|are you a robot/i.test(body.slice(0, 3000))) {
      return [];
    }
    const $ = cheerio.load(body);
    let raw = jsonLdProducts($).map(p => ({ jsonld: p }));
    if (raw.length === 0) {
      raw = [];
      $('[data-testid="plp-product-card"]').each((_, el) => {
        const e = $(el);
        const a = e.find('a[data-testid="product-card-title-link"]').first();
        const href = a.attr('href');
        const title = e.find('[data-testid="product-card-title"]').first().text().trim();
        if (!href || !title) return;
        raw.push({
          title,
          url: href,
          price: e.find('[data-testid="primary-price"]').first().text().trim(),
          image: e.find('img').first().attr('src'),
        });
      });
    }
    if (raw.length === 0) {
      return [];
    }
    return raw.slice(0, limit).map(r => this.normalize(r)).filter(Boolean);
  },

  async scrape(url, opts = {}) {
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200) return null;
    const $ = cheerio.load(body);
    const p = jsonLdProducts($).find(x => x['@type'] === 'Product');
    if (p) return this.normalize({ jsonld: p, url });
    return null;
  },

  normalize(raw) {
    if (raw.jsonld) {
      const p = raw.jsonld;
      const offers = p.offers || {};
      return {
        source: 'adidas',
        category: 'shopping',
        title: p.name || null,
        url: canon(p.url || raw.url || '', 'https://www.adidas.com/'),
        price: offers.price || null,
        currency: offers.priceCurrency || null,
        oldPrice: null,
        discount: null,
        availability: null,
        rating: p.aggregateRating ? String(p.aggregateRating.ratingValue) : null,
        reviews: p.aggregateRating ? String(p.aggregateRating.reviewCount) : null,
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
        brand: 'adidas',
        categoryName: null,
        metadata: {},
      };
    }
    if (!raw.title) return null;
    return {
      source: 'adidas',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.adidas.com/'),
      price: raw.price || null,
      currency: raw.price && raw.price.includes('$') ? 'USD' : null,
      oldPrice: null,
      discount: null,
      availability: null,
      rating: null,
      reviews: null,
      image: raw.image || null,
      brand: 'adidas',
      categoryName: null,
      metadata: {},
    };
  },
};
