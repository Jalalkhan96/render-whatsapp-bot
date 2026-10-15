const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Collects ONLY public property listing info (name, public URL, price, rating).
// Never collects or touches private customer data (names, emails, bookings, payment).

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

const DEFAULT_DEST = 'Dubai';

module.exports = {
  id: 'booking',
  name: 'Booking.com',
  country: 'INT',
  category: 'hotels',
  baseUrl: 'https://www.booking.com/',
  language: 'en',
  enabled: true,
  priority: 100,
  transport: 'provider-required',
  providerRequiredReason: 'anti-bot; needs official Booking.com Connectivity/API partner access or provider',
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.booking.com/searchresults.html?ss=Dubai',
    search: q => 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(q),
  },
  selectors: {
    // Verified only if the live fetch returns parseable markup; see smoke test.
    propertyCard: 'div[data-testid="property-card"]',
    title: 'div[data-testid="title"]',
    link: 'a[data-testid="title-link"]',
    price: 'span[data-testid="price-and-discounted-price"]',
    reviewScore: 'div[data-testid="review-score"] > div:first-child',
    image: 'img[data-testid="image"]',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    return this.search(DEFAULT_DEST, opts);
  },

  async search(query, opts = {}) {
    const limit = opts.limit || 30;
    const url = module.exports.endpoints.search(query);
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200 || /captcha|robot|access denied|suspicious/i.test(body.slice(0, 3000))) {
      return [];
    }
    const $ = cheerio.load(body);
    const raw = [];
    const seen = new Set();
    $('div[data-testid="property-card"]').each((_, el) => {
      const e = $(el);
      const link = e.find('a[data-testid="title-link"]').attr('href');
      const title = e.find('div[data-testid="title"]').text().trim();
      if (!link || !title || seen.has(link)) return;
      seen.add(link);
      raw.push({
        title,
        url: link,
        description: e.find('div[data-testid="property-card-desktop-single-image"]').parent().find('p').first().text().trim() || null,
        price: e.find('span[data-testid="price-and-discounted-price"]').first().text().trim(),
        reviewScore: e.find('div[data-testid="review-score"] > div').first().text().trim(),
        image: e.find('img[data-testid="image"]').attr('src'),
      });
    });
    if (raw.length === 0) {
      return [];
    }
    return raw.slice(0, limit).map(r => this.normalize(r, query)).filter(Boolean);
  },

  async scrape(url, opts = {}) {
    // Public property page only; never scrapes private customer data.
    const { status, body } = await fetchPage(url, 2);
    if (status !== 200) return null;
    const $ = cheerio.load(body);
    const title = $('h2[data-testid="property-name"]').text().trim() || $('#hp_hotel_name').text().trim();
    if (!title) return null;
    return this.normalize({ title, url, raw$: true }, null);
  },

  normalize(raw, destination) {
    if (!raw.title) return null;
    return {
      source: 'booking',
      category: 'hotels',
      title: raw.title,
      description: raw.description || null,
      url: canon(raw.url, 'https://www.booking.com/'),
      image: raw.image || null,
      metadata: {
        destination: destination || null,
        price: raw.price || null,
        currency: raw.price && raw.price.includes('$') ? 'USD' : null,
        rating: null,
        reviewScore: raw.reviewScore || null,
        amenities: null,
      },
      scrapedAt: new Date().toISOString(),
    };
  },
};
