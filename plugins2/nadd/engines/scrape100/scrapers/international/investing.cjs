// Investing.com adapter (id 81)
// Transport: RSS. investing.com HTML pages return HTTP 403 (Cloudflare "Just a moment...")
// to datacenter IPs, so the public RSS feed is the only reachable surface. Verified live.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, { accept } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

function parseInvestingDate(s) {
  // format: "2026-10-04 19:54:27" (UTC)
  if (!s) return null;
  const d = new Date(s.trim().replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'investing',
    sourceUrl: 'https://www.investing.com/',
    category: 'finance',
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
  const { status, text } = await fetchWithRetry('https://www.investing.com/rss/news_25.rss', {
    accept: 'application/rss+xml, application/xml, text/xml',
  });
  if (status !== 200 || !text.includes('<item')) return [];
  const $ = cheerio.load(text, { xmlMode: true });
  const items = [];
  $('item').each((i, el) => {
    const $el = $(el);
    items.push({
      title: $el.find('title').text().trim() || null,
      url: $el.find('link').text().trim() || null,
      description: $el.find('description').text().trim() || null,
      image: $el.find('enclosure').attr('url') || null,
      publishedAt: parseInvestingDate($el.find('pubDate').text()),
    });
  });
  return items.filter(x => x.title && x.url);
}

module.exports = {
  id: 81,
  name: 'Investing.com',
  country: 'INT',
  category: 'finance',
  baseUrl: 'https://www.investing.com/',
  language: 'en',
  enabled: true,
  priority: 81,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    rss: 'https://www.investing.com/rss/news_25.rss',
    note: 'HTML pages (homepage, article pages) return HTTP 403 via Cloudflare to non-browser IPs; RSS feed is the only verified public surface.',
  },
  selectors: {
    item: 'item',
    title: 'title',
    link: 'link',
    pubDate: 'pubDate',
    image: 'enclosure[url]',
    description: 'description',
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const items = await fetchRss();
    return items.slice(0, limit).map(normalize);
  },

  // No public search endpoint is reachable (site search is JS + Cloudflare-gated).
  async search() { return []; },

  // Article pages are Cloudflare-gated (verified 403); only RSS metadata is available.
  async scrape() { return null; },

  normalize,
};
