// Yahoo Finance adapter (id 83)
// Transport: api. Uses the PUBLIC, keyless chart API
// https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
// plus the public search API. News via the public Yahoo finance RSS.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Default symbol list for latest() — documented here and in endpoints.
const DEFAULT_SYMBOLS = ['^GSPC', '^DJI', 'BTC-USD', 'EURUSD=X', 'GC=F'];

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
          'Accept': accept || 'application/json',
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

async function fetchChart(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1d';
  const { status, text } = await fetchWithRetry(url);
  if (status !== 200) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const t = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    price: meta.regularMarketPrice,
    change: typeof meta.regularMarketChange === 'number' ? meta.regularMarketChange : null,
    changePercent: typeof meta.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : null,
    currency: meta.currency || null,
    volume: typeof meta.regularMarketVolume === 'number' ? meta.regularMarketVolume : null,
    url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbol),
    metadata: {
      exchange: meta.fullExchangeName || meta.exchangeName || null,
      marketTime: t,
      previousClose: meta.chartPreviousClose ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    },
  };
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'yahoo-finance',
    category: 'finance',
    symbol: raw.symbol || null,
    name: raw.name || null,
    price: typeof raw.price === 'number' ? raw.price : null,
    change: typeof raw.change === 'number' ? raw.change : null,
    changePercent: typeof raw.changePercent === 'number' ? raw.changePercent : null,
    currency: raw.currency || null,
    volume: typeof raw.volume === 'number' ? raw.volume : null,
    url: raw.url || null,
    metadata: raw.metadata || {},
  };
}

function normalizeNews(raw) {
  if (!raw) return null;
  return {
    source: 'yahoo-finance',
    sourceUrl: 'https://finance.yahoo.com/',
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

module.exports = {
  id: 83,
  name: 'Yahoo Finance',
  country: 'INT',
  category: 'finance',
  baseUrl: 'https://finance.yahoo.com/',
  language: 'en',
  enabled: true,
  priority: 83,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    chart: 'https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1d',
    searchApi: 'https://query1.finance.yahoo.com/v1/finance/search?q={QUERY}',
    newsRss: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s={SYMBOL}&region=US&lang=en-US',
    defaultSymbols: DEFAULT_SYMBOLS,
    note: 'All endpoints are public and keyless. latest() returns quotes for the default symbol list: '
      + DEFAULT_SYMBOLS.join(', ')
      + ' (S&P 500, Dow Jones, Bitcoin/USD, EUR/USD, Gold futures).',
  },
  selectors: {},
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 5, this.limits.maxResults);
    const symbols = (opts.symbols && opts.symbols.length ? opts.symbols : DEFAULT_SYMBOLS).slice(0, limit);
    const out = [];
    for (const s of symbols) {
      try {
        const q = await fetchChart(s);
        if (q) out.push(normalize(q));
      } catch { /* skip failed symbol */ }
      await sleep(this.rateLimit.delayMs);
    }
    return out;
  },

  async search(query, opts = {}) {
    if (!query) return [];
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=' + limit + '&newsCount=0';
    let j;
    try {
      const { status, text } = await fetchWithRetry(url);
      if (status !== 200) return [];
      j = JSON.parse(text);
    } catch { return []; }
    const quotes = (j && j.quotes) || [];
    return quotes.slice(0, limit).map(q => normalize({
      symbol: q.symbol || null,
      name: q.longname || q.shortname || q.symbol || null,
      price: null, // search API returns identifiers only, not prices
      change: null,
      changePercent: null,
      currency: null,
      volume: null,
      url: q.symbol ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(q.symbol) : null,
      metadata: { exchange: q.exchDisp || q.exchange || null, quoteType: q.quoteType || null, sector: q.sectorDisp || q.sector || null },
    })).filter(Boolean);
  },

  // Generic article fetch: best-effort h1 + paragraphs, returns null when blocked.
  async scrape(url) {
    if (!url) return null;
    try {
      const { status, text } = await fetchWithRetry(url, { accept: 'text/html,application/xhtml+xml' });
      if (status !== 200 || !text) return null;
      const $ = cheerio.load(text);
      const title = $('h1').first().text().trim() || null;
      const paras = [];
      $('article p, [data-testid="article-body"] p, .caas-body p').each((i, el) => {
        const t = $(el).text().trim();
        if (t.length > 40) paras.push(t);
      });
      if (!title && paras.length === 0) return null;
      return normalizeNews({ title, url, content: paras.join('\n\n') || null });
    } catch { return null; }
  },

  normalize,
};
