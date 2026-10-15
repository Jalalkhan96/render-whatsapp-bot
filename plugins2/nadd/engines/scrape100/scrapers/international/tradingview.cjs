// TradingView adapter (id 82)
// Transport: api. Uses the PUBLIC, unauthenticated scanner endpoint
// https://scanner.tradingview.com/symbol?symbol=EXCHANGE:SYMBOL&fields=...
// Verified live: BITSTAMP:BTCUSD, NASDAQ:AAPL return quotes. Symbol pages and
// symbol_search are JS-heavy / 403, so no page scraping or search.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: ctl.signal,
        redirect: 'follow',
      });
      const text = await res.text();
      clearTimeout(timer);
      if (res.status !== 200) return null;
      try { return JSON.parse(text); } catch { return null; }
    } catch (e) { lastErr = e; }
    await sleep(800 * Math.pow(2, attempt));
  }
  throw lastErr;
}

// Verified working on the live scanner API (others 404 with code symbol_not_exists).
const DEFAULT_SYMBOLS = ['BITSTAMP:BTCUSD', 'NASDAQ:AAPL', 'FX:EURUSD', 'OANDA:XAUUSD', 'BINANCE:ETHUSDT'];

async function fetchQuote(tvSymbol) {
  const url = 'https://scanner.tradingview.com/symbol?symbol=' + encodeURIComponent(tvSymbol)
    + '&fields=description,close,change,change_abs,volume,currency';
  const j = await fetchJson(url);
  if (!j || j.close == null) return null;
  const short = tvSymbol.split(':')[1] || tvSymbol;
  return {
    symbol: short,
    name: j.description || short,
    price: j.close,
    change: j.change_abs ?? null,
    changePercent: j.change ?? null,
    currency: j.currency || null,
    volume: j.volume ?? null,
    url: 'https://www.tradingview.com/symbols/' + tvSymbol.replace(':', '-'),
    metadata: { tvSymbol },
  };
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'tradingview',
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

module.exports = {
  id: 82,
  name: 'TradingView',
  country: 'INT',
  category: 'finance',
  baseUrl: 'https://www.tradingview.com/',
  language: 'en',
  enabled: true,
  priority: 82,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    scanner: 'https://scanner.tradingview.com/symbol?symbol={EXCHANGE:SYMBOL}&fields=description,close,change,change_abs,volume,currency',
    defaultSymbols: DEFAULT_SYMBOLS,
    note: 'Unauthenticated public scanner endpoint. Verified symbols: ' + DEFAULT_SYMBOLS.join(', ')
      + '. last_price is null in responses; close carries the price. symbol_search endpoint is 403; symbol pages are JS-heavy with no SSR data.',
  },
  selectors: {},
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 5, this.limits.maxResults);
    const symbols = (opts.symbols && opts.symbols.length ? opts.symbols : DEFAULT_SYMBOLS).slice(0, limit);
    const out = [];
    for (const s of symbols) {
      try {
        const q = await fetchQuote(s);
        if (q) out.push(normalize(q));
      } catch { /* skip failed symbol */ }
      await sleep(this.rateLimit.delayMs);
    }
    return out;
  },

  // symbol_search.tradingview.com is 403 (verified); no public search.
  async search() { return []; },

  // Symbol pages are JS-rendered with no server-side quote data; not scrapable honestly.
  async scrape() { return null; },

  normalize,
};
