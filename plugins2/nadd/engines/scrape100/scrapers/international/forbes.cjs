// Forbes adapter (id 87)
// Transport: rss. The public business-channel RSS feed is reachable (HTTP 200,
// 25 items with title/link/pubDate/dc:creator/description). Article pages return
// HTTP 403 to non-browser IPs, so full-body scrape is not available.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: ctl.signal,
        redirect: 'follow',
      });
      const text = await res.text();
      clearTimeout(timer);
      return { status: res.status, text };
    } catch (e) { lastErr = e; }
    await sleep(800 * Math.pow(2, attempt));
  }
  throw lastErr;
}

function asIso(s) {
  if (!s) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'forbes',
    sourceUrl: 'https://www.forbes.com/',
    category: 'business',
    title: raw.title || null,
    description: raw.description || null,
    content: raw.content || null,
    url: raw.url || null,
    image: raw.image || null,
    author: raw.author || null,
    publishedAt: raw.publishedAt || null,
    updatedAt: raw.updatedAt || null,
    country: 'INT',
    language: 'en',
    tags: raw.tags || [],
    metadata: raw.metadata || {},
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchRss() {
  const { status, text } = await fetchWithRetry('https://www.forbes.com/business/feed/');
  if (status !== 200 || !text.includes('<item')) return [];
  const $ = cheerio.load(text, { xmlMode: true });
  const items = [];
  $('item').each((i, el) => {
    const $el = $(el);
    items.push({
      title: $el.find('title').text().trim() || null,
      url: $el.find('link').text().trim() || null,
      description: $el.find('description').text().trim() || null,
      author: $el.find('dc\\:creator').text().trim() || null,
      publishedAt: asIso($el.find('pubDate').text()),
    });
  });
  return items.filter(x => x.title && x.url);
}

module.exports = {
  id: 87,
  name: 'Forbes',
  country: 'INT',
  category: 'business',
  baseUrl: 'https://www.forbes.com/',
  language: 'en',
  enabled: true,
  priority: 87,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    rss: 'https://www.forbes.com/business/feed/',
    note: 'Business-channel RSS verified live (25 items). Article pages return HTTP 403 to non-browser IPs, so scrape() is not available.',
  },
  selectors: {
    item: 'item',
    title: 'title',
    link: 'link',
    pubDate: 'pubDate',
    author: 'dc:creator',
    description: 'description',
  },
  schedule: { frequency: 'low' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const items = await fetchRss();
    return items.slice(0, limit).map(normalize);
  },

  // No verified public search endpoint.
  async search() { return []; },

  // Article pages are 403-gated (verified); only RSS metadata is available.
  async scrape() { return null; },

  normalize,
};
