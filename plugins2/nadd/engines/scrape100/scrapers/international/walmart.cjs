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
  id: 'walmart',
  name: 'Walmart',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.walmart.com/',
  language: 'en',
  enabled: true,
  priority: 94,
  transport: 'provider-required',
  providerRequiredReason: 'anti-bot (PerimeterX/CAPTCHA); needs official Walmart API or provider',
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.walmart.com/search?q=laptop',
    search: q => 'https://www.walmart.com/search?q=' + encodeURIComponent(q),
  },
  selectors: {
    // Verified only if the live fetch returns parseable markup; see smoke test.
    searchResult: '[data-item-id]',
    title: '[data-automation-id="product-title"]',
    link: 'a[link-identifier]',
    price: '[data-automation-id="product-price"]',
    image: 'img[data-automation-id]',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200 || /px-captcha|captcha|robot|access denied/i.test(body.slice(0, 3000))) {
      return [];
    }
    const $ = cheerio.load(body);
    let raw = jsonLdProducts($).map(p => ({ jsonld: p }));
    if (raw.length === 0) {
      raw = [];
      $('[data-item-id]').each((_, el) => {
        const e = $(el);
        const a = e.find('a[link-identifier]').first();
        const href = a.attr('href');
        const title = e.find('[data-automation-id="product-title"]').text().trim();
        if (!href || !title) return;
        raw.push({
          title,
          url: href,
          price: e.find('[data-automation-id="product-price"]').first().text().trim(),
          image: e.find('img').attr('src'),
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
        source: 'walmart',
        category: 'shopping',
        title: p.name || null,
        url: canon(p.url || raw.url || '', 'https://www.walmart.com/'),
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
      source: 'walmart',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.walmart.com/'),
      price: raw.price || null,
      currency: raw.price && raw.price.includes('$') ? 'USD' : null,
      oldPrice: null,
      discount: null,
      availability: null,
      rating: null,
      reviews: null,
      image: raw.image || null,
      brand: null,
      categoryName: null,
      metadata: {},
    };
  },
};
