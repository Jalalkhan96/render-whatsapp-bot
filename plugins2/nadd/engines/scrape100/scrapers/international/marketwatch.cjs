// MarketWatch adapter (id 89)
// Transport: http. The homepage is publicly reachable (HTTP 200) and renders
// article cards with absolute /story/ URLs. Article pages are reachable and
// carry ld+json NewsArticle metadata plus articleBody blocks inside the
// __NEXT_DATA__ script (ParagraphArticleBody -> textAndDecorations.nested[].text).
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'marketwatch',
    sourceUrl: 'https://www.marketwatch.com/',
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

async function fetchHomepageArticles() {
  const { status, text } = await fetchWithRetry('https://www.marketwatch.com/');
  if (status !== 200 || !text) return [];
  const $ = cheerio.load(text);
  const seen = new Set();
  const items = [];
  $('article a').each((i, el) => {
    const href = ($(el).attr('href') || '').split('?')[0];
    const title = $(el).text().trim().replace(/\s+/g, ' ');
    if (!href.includes('/story/') || title.length < 30) return;
    const url = href.startsWith('http') ? href : 'https://www.marketwatch.com' + href;
    if (seen.has(url)) return;
    seen.add(url);
    items.push({ title, url });
  });
  return items;
}

// Extract article text from __NEXT_DATA__ ParagraphArticleBody blocks.
function extractBodyFromNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[1]); } catch { return null; }
  const stack = [j];
  let articleBody = null;
  while (stack.length && !articleBody) {
    const cur = stack.pop();
    if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue; }
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) {
        if (k === 'articleBody' && Array.isArray(cur[k])) { articleBody = cur[k]; break; }
        stack.push(cur[k]);
      }
    }
  }
  if (!articleBody) return null;
  const paras = [];
  for (const b of articleBody) {
    if (b && b.__typename === 'ParagraphArticleBody' && b.textAndDecorations && Array.isArray(b.textAndDecorations.nested)) {
      for (const n of b.textAndDecorations.nested) {
        if (n && typeof n.text === 'string' && n.text.trim().length > 20) paras.push(n.text.trim());
      }
    }
  }
  return paras.length ? paras.join('\n\n') : null;
}

module.exports = {
  id: 89,
  name: 'MarketWatch',
  country: 'INT',
  category: 'finance',
  baseUrl: 'https://www.marketwatch.com/',
  language: 'en',
  enabled: true,
  priority: 89,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    homepage: 'https://www.marketwatch.com/',
    article: 'https://www.marketwatch.com/story/{slug}-{id}',
    quoteExample: 'https://www.marketwatch.com/investing/index/djia',
    note: 'Homepage article cards (article a -> /story/ URLs) verified live. Article pages verified: ld+json NewsArticle metadata + __NEXT_DATA__ articleBody paragraphs. Quote pages render <bg-quote field="last"> with the price.',
  },
  selectors: {
    card: 'article a',
    articleTitle: 'h1',
    articleMeta: 'script[type="application/ld+json"]',
    articleBody: '__NEXT_DATA__ articleBody[].textAndDecorations.nested[].text',
    quotePrice: 'bg-quote[field="last"]',
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const items = await fetchHomepageArticles();
    return items.slice(0, limit).map(normalize);
  },

  // No verified public search endpoint.
  async search() { return []; },

  async scrape(url) {
    if (!url || !url.includes('marketwatch.com/story/')) return null;
    try {
      const { status, text } = await fetchWithRetry(url);
      if (status !== 200 || !text) return null;
      const $ = cheerio.load(text);
      const title = $('h1').first().text().trim() || null;
      const content = extractBodyFromNextData(text);
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
            if (n.image) image = typeof n.image === 'string' ? n.image : (n.image.url || (Array.isArray(n.image) ? n.image[0] : null) || null);
            if (image && typeof image !== 'string') image = image.url || null;
          }
        } catch { /* ignore malformed ld+json */ }
      });
      if (!title && !content) return null;
      return normalize({ title, url, description, content, image, author, publishedAt, metadata: { via: 'story-page' } });
    } catch { return null; }
  },

  normalize,
};
