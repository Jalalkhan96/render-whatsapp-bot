// CoinGecko adapter (id 86)
// Transport: api. Uses the FREE, keyless public API:
//   https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd
// Rate-limited upstream, so latest() makes exactly ONE request per call.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url) {
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
      if (res.status === 429) return { rateLimited: true };
      if (res.status !== 200) return { status: res.status };
      try { return { status: 200, json: JSON.parse(text) }; } catch { return { status: res.status }; }
    } catch (e) { lastErr = e; }
    await sleep(800 * Math.pow(2, attempt));
  }
  throw lastErr;
}

function normalize(raw) {
  if (!raw) return null;
  return {
    source: 'coingecko',
    category: 'crypto',
    symbol: raw.symbol ? String(raw.symbol).toUpperCase() : null,
    name: raw.name || null,
    price: typeof raw.price === 'number' ? raw.price : null,
    change: null, // markets endpoint exposes percent change only
    changePercent: typeof raw.changePercent === 'number' ? raw.changePercent : null,
    currency: 'USD',
    volume: typeof raw.volume === 'number' ? raw.volume : null,
    url: raw.url || null,
    metadata: raw.metadata || {},
  };
}

module.exports = {
  id: 86,
  name: 'CoinGecko',
  country: 'INT',
  category: 'crypto',
  baseUrl: 'https://www.coingecko.com/',
  language: 'en',
  enabled: true,
  priority: 86,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    markets: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page={N}&page=1&sparkline=false&price_change_percentage=24h',
    searchApi: 'https://api.coingecko.com/api/v3/search?query={QUERY}',
    note: 'Free public API, no key. latest() issues exactly ONE request per call to respect rate limits; returns [] on HTTP 429.',
  },
  selectors: {},
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc'
      + '&per_page=' + limit + '&page=1&sparkline=false&price_change_percentage=24h';
    let res;
    try { res = await fetchWithRetry(url); } catch { return []; }
    if (!res || res.rateLimited || res.status !== 200 || !Array.isArray(res.json)) return [];
    return res.json.map(c => normalize({
      symbol: c.symbol || null,
      name: c.name || null,
      price: c.current_price ?? null,
      changePercent: c.price_change_percentage_24h ?? null,
      volume: c.total_volume ?? null,
      url: c.id ? 'https://www.coingecko.com/en/coins/' + c.id : null,
      metadata: {
        id: c.id || null,
        marketCapRank: c.market_cap_rank ?? null,
        marketCap: c.market_cap ?? null,
        high24h: c.high_24h ?? null,
        low24h: c.low_24h ?? null,
        image: c.image || null,
        lastUpdated: c.last_updated || null,
      },
    })).filter(Boolean);
  },

  // Public /search endpoint: returns coin identifiers (no prices).
  async search(query, opts = {}) {
    if (!query) return [];
    const limit = Math.min(opts.limit || 10, this.limits.maxResults);
    let res;
    try { res = await fetchWithRetry('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(query)); }
    catch { return []; }
    if (!res || res.rateLimited || res.status !== 200 || !res.json || !Array.isArray(res.json.coins)) return [];
    return res.json.coins.slice(0, limit).map(c => normalize({
      symbol: c.symbol || null,
      name: c.name || null,
      price: null, // search endpoint returns identifiers only
      changePercent: null,
      volume: null,
      url: c.id ? 'https://www.coingecko.com/en/coins/' + c.id : null,
      metadata: { id: c.id || null, marketCapRank: c.market_cap_rank ?? null, thumb: c.thumb || null },
    })).filter(Boolean);
  },

  // Coin pages are not needed; all data comes from the API.
  async scrape() { return null; },

  normalize,
};
