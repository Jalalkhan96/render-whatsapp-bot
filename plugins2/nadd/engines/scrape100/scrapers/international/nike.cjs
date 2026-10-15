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

function canon(u, base) {
  try { return new URL(u, base).toString().split('#')[0]; } catch (_) { return u; }
}

const DEFAULT_Q = 'shoes';

module.exports = {
  id: 'nike',
  name: 'Nike',
  country: 'INT',
  category: 'shopping',
  baseUrl: 'https://www.nike.com/',
  language: 'en',
  enabled: true,
  priority: 98,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.nike.com/w?q=shoes&vst=shoes',
    search: q => 'https://www.nike.com/w?q=' + encodeURIComponent(q) + '&vst=' + encodeURIComponent(q),
  },
  selectors: {
    // Verified live 2026-10-05 against the server-rendered www.nike.com/w search page:
    searchResult: 'div.product-card.product-grid__card',
    title: 'a.product-card__link-overlay',
    link: 'a.product-card__link-overlay',
    price: '[data-testid="product-price"]',
    image: 'img.product-card__hero-image',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_Q, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200 || /are you a robot|captcha challenge|access denied/i.test(body.slice(0, 3000))) {
      module.exports.transport = 'provider-required';
      module.exports.providerRequiredReason = 'anti-bot (Akamai); needs official Nike API or provider';
      return [];
    }
    const $ = cheerio.load(body);
    const raw = [];
    const seen = new Set();
    $('div.product-card.product-grid__card').each((_, el) => {
      const e = $(el);
      const a = e.find('a.product-card__link-overlay').first();
      const href = a.attr('href');
      const title = a.text().trim();
      if (!href || !title || seen.has(href)) return;
      seen.add(href);
      raw.push({
        title,
        url: href,
        price: e.find('[data-testid="product-price"]').first().text().trim(),
        image: e.find('img.product-card__hero-image').attr('src'),
      });
    });
    if (raw.length === 0) {
      module.exports.transport = 'provider-required';
      module.exports.providerRequiredReason = 'anti-bot (Akamai); needs official Nike API or provider';
      return [];
    }
    return raw.slice(0, limit).map(r => this.normalize(r)).filter(Boolean);
  },

  async scrape(url, opts = {}) {
    return null; // product detail is rendered client-side; search page is the supported path
  },

  normalize(raw) {
    if (!raw.title) return null;
    return {
      source: 'nike',
      category: 'shopping',
      title: raw.title,
      url: canon(raw.url, 'https://www.nike.com/'),
      price: raw.price || null,
      currency: raw.price && raw.price.includes('$') ? 'USD' : null,
      oldPrice: null,
      discount: null,
      availability: null,
      rating: null,
      reviews: null,
      image: raw.image || null,
      brand: 'Nike',
      categoryName: null,
      metadata: {},
    };
  },
};
