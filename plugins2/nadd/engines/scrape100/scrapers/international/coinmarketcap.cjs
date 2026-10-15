// CoinMarketCap adapter (id 85)
// Transport: json. The homepage HTML is publicly reachable (HTTP 200) and embeds
// __NEXT_DATA__ JSON containing cryptoCurrencyList with per-currency quotes.
// Tried first per spec; the official REST API needs a key and is not used.
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

// Deep-search a parsed JSON tree for the first array stored under key `name`.
function findKeyedArray(obj, name, depth = 0) {
  if (!obj || depth > 12) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const hit = findKeyedArray(v, name, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === name && Array.isArray(obj[k]) && obj[k].length) return obj[k];
      const hit = findKeyedArray(obj[k], name, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'coinmarketcap',
    category: 'crypto',
    symbol: raw.symbol || null,
    name: raw.name || null,
    price: typeof raw.price === 'number' ? raw.price : null,
    change: null, // embedded list exposes percent changes only
    changePercent: typeof raw.changePercent === 'number' ? raw.changePercent : null,
    currency: raw.currency || null,
    volume: typeof raw.volume === 'number' ? raw.volume : null,
    url: raw.url || null,
    metadata: raw.metadata || {},
  };
}

async function fetchListings() {
  const { status, text } = await fetchWithRetry('https://coinmarketcap.com/');
  if (status !== 200 || !text) return [];
  const m = text.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let j;
  try { j = JSON.parse(m[1]); } catch { return []; }
  const list = findKeyedArray(j, 'cryptoCurrencyList');
  if (!list) return [];
  return list
    .filter(e => e && e.isActive !== 0 && typeof e.cmcRank === 'number')
    .sort((a, b) => a.cmcRank - b.cmcRank)
    .map(e => {
      const quotes = Array.isArray(e.quotes) ? e.quotes : [];
      const usd = quotes.find(q => q && q.name === 'USD') || quotes[0] || {};
      return {
        symbol: e.symbol || null,
        name: e.name || null,
        price: typeof usd.price === 'number' ? usd.price : null,
        changePercent: typeof usd.percentChange24h === 'number' ? usd.percentChange24h : null,
        currency: usd.name || 'USD',
        volume: typeof usd.volume24h === 'number' ? usd.volume24h : null,
        url: e.slug ? 'https://coinmarketcap.com/currencies/' + e.slug + '/' : null,
        metadata: {
          cmcRank: e.cmcRank,
          marketCap: typeof usd.marketCap === 'number' ? usd.marketCap : null,
          circulatingSupply: e.circulatingSupply ?? null,
          percentChange1h: usd.percentChange1h ?? null,
          percentChange7d: usd.percentChange7d ?? null,
          lastUpdated: e.lastUpdated || null,
        },
      };
    })
    .filter(x => x.symbol && typeof x.price === 'number');
}

module.exports = {
  id: 85,
  name: 'CoinMarketCap',
  country: 'INT',
  category: 'crypto',
  baseUrl: 'https://coinmarketcap.com/',
  language: 'en',
  enabled: true,
  priority: 85,
  transport: 'json',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    listings: 'https://coinmarketcap.com/',
    embeddedJson: '__NEXT_DATA__ -> cryptoCurrencyList[] with quotes[] (name, price, volume24h, marketCap, percentChange24h)',
    note: 'Embedded JSON on the public homepage is tried first and works; the official REST API requires an API key and is not used.',
  },
  selectors: {},
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const rows = await fetchListings();
    return rows.slice(0, limit).map(normalize);
  },

  // No public keyless search; the site search is JS/API-key gated.
  async search() { return []; },

  // Currency detail pages are JS-rendered; no SSR price data verified there.
  async scrape() { return null; },

  normalize,
};
