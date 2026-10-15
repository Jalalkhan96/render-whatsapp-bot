// CNBC adapter (id 90)
// Transport: rss. The public Top News RSS feed is reachable (HTTP 200, 30 items).
// Article pages are reachable (HTTP 200) and carry ld+json NewsArticle metadata
// plus an article-body paragraph container (verified: #ArticleBody selector family).
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

function asIso(s) {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function ldAuthor(a) {
  if (!a) return null;
  const list = Array.isArray(a) ? a : [a];
  const names = list.map(x => (x && x.name ? String(x.name) : '')).filter(Boolean);
  return names.length ? names.join(', ') : null;
}

function ldImage(im) {
  if (!im) return null;
  const first = Array.isArray(im) ? im[0] : im;
  if (!first) return null;
  return typeof first === 'string' ? first : (first.url || null);
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'cnbc',
    sourceUrl: 'https://www.cnbc.com/',
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
  const { status, text } = await fetchWithRetry('https://www.cnbc.com/id/100003114/device/rss/rss.html', {
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
      publishedAt: asIso($el.find('pubDate').text()),
    });
  });
  return items.filter(x => x.title && x.url);
}

module.exports = {
  id: 90,
  name: 'CNBC',
  country: 'INT',
  category: 'business',
  baseUrl: 'https://www.cnbc.com/',
  language: 'en',
  enabled: true,
  priority: 90,
  transport: 'rss',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    rss: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    note: 'Top News RSS verified live (30 items). Article pages verified: ld+json NewsArticle metadata + article-body paragraphs.',
  },
  selectors: {
    item: 'item',
    title: 'title',
    link: 'link',
    pubDate: 'pubDate',
    description: 'description',
    articleTitle: 'h1',
    articleBody: '#ArticleBody p, [data-testid="article-body"] p, .ArticleBody-articleBody p',
    articleMeta: 'script[type="application/ld+json"]',
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const items = await fetchRss();
    return items.slice(0, limit).map(normalize);
  },

  // No verified public search endpoint.
  async search() { return []; },

  async scrape(url) {
    if (!url || !url.includes('cnbc.com')) return null;
    try {
      const { status, text } = await fetchWithRetry(url);
      if (status !== 200 || !text) return null;
      const $ = cheerio.load(text);
      const title = $('h1').first().text().trim() || null;
      const paras = [];
      $('#ArticleBody p, [data-testid="article-body"] p, .ArticleBody-articleBody p').each((i, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) paras.push(t);
      });
      let author = null, publishedAt = null, image = null, description = null;
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const j = JSON.parse($(el).html());
          const list = Array.isArray(j) ? j : [j];
          const n = list.find(x => x && x['@type'] === 'NewsArticle');
          if (n) {
            author = ldAuthor(n.author);
            publishedAt = asIso(n.datePublished);
            description = n.description || description;
            image = ldImage(n.image);
          }
        } catch { /* ignore malformed ld+json */ }
      });
      if (!title && paras.length === 0) return null;
      return normalize({
        title, url, description,
        content: paras.join('\n\n') || null,
        image, author, publishedAt,
        metadata: { via: 'article-page' },
      });
    } catch { return null; }
  },

  normalize,
};
