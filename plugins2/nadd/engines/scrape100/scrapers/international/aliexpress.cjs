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
  id: 'aliexpress',
  name: 'AliExpress',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.aliexpress.com/',
  language: 'en',
  enabled: true,
  priority: 93,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.aliexpress.com/wholesale?SearchText=laptop',
    search: q => 'https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(q),
  },
  selectors: {
    // Verified only if the live fetch returns parseable markup; see smoke test.
    searchResult: '.search-item-card-wrapper-gallery, a.search-card-item',
    title: '.search-card-item .manhattan--titleText--WccS2rq',
    link: 'a.search-card-item',
    price: '.manhattan--price-sale--1CCSZfK',
    image: 'img.search-card-item__image',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    const { status, body } = await fetchPage(url, 2);
    // AliExpress serves a 200 with a PerimeterX/robot shell on blocked requests —
    // treat a missing card grid as blocked, not a 403-only signal.
    if (status !== 200 || /captcha-page|_dmtrack_captcha|are you a robot/i.test(body.slice(0, 5000))) {
      module.exports.transport = 'provider-required';
      module.exports.providerRequiredReason = 'JS-heavy + anti-bot; needs official AliExpress API (Affiliate/DS API) or provider';
      return [];
    }
    const $ = cheerio.load(body);
    const raw = [];
    const seen = new Set();
    // Verified live 2026-10-05: a.search-card-item cards with hashed CSS-module
    // classes (us--title--*, us--price--*); matched via partial class names.
    $('a.search-card-item').each((_, el) => {
      const e = $(el);
      const href = e.attr('href');
      const title = e.find('[class*="--title--"]').first().text().trim();
      if (!href || !title || seen.has(href)) return;
      seen.add(href);
      const priceTxt = e.find('[class*="--price--"]').first().text().trim();
      const img = e.find('img').first().attr('src');
      raw.push({ title, url: href, price: priceTxt, image: img ? 'https:' + img : null });
    });
    if (raw.length === 0) {
      module.exports.transport = 'provider-required';
      module.exports.providerRequiredReason = 'JS-heavy + anti-bot; needs official AliExpress API (Affiliate/DS API) or provider';
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
        source: 'aliexpress',
        category: 'shopping',
        title: p.name || null,
        url: canon(p.url || raw.url || '', 'https://www.aliexpress.com/'),
        price: offers.price || null,
        currency: offers.priceCurrency || null,
        oldPrice: null,
        discount: null,
        availability: null,
        rating: p.aggregateRating ? String(p.aggregateRating.ratingValue) : null,
        reviews: p.aggregateRating ? String(p.aggregateRating.reviewCount) : null,
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
        brand: null,
        categoryName: null,
        metadata: {},
      };
    }
    if (!raw.title) return null;
    // Price text looks like "$180.66$543.82 -66%": first amount = sale, second = was.
    const amounts = (raw.price || '').match(/\$[\d,.]+/g) || [];
    return {
      source: 'aliexpress',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.aliexpress.com/'),
      price: amounts[0] || null,
      currency: amounts.length ? 'USD' : null,
      oldPrice: amounts[1] || null,
      discount: amounts.length > 1,
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
