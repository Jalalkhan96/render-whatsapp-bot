'use strict';
/* Pakistan Stock Exchange — psx.com.pk
 * transport: http (server-rendered market data on the homepage).
 * Verified 2026-10-05:
 *  - The homepage renders a "Market Highlights" table server-side with:
 *      #curIndex (current index), #cahnge (change — site's own typo),
 *      #percentchange, #high, #low, #volume (appears twice: volume then
 *      previous close), #value (traded value), and a "Market Status" row.
 *  - The default index is the first option of select#tracker ("KSE 100").
 * Only publicly rendered figures are extracted; nothing is invented.
 * Search is not supported (market-data source, no text search used).
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://www.psx.com.pk';

async function fetchText(url, timeoutMs = 25000) {
  let lastErr = new Error('fetch failed: ' + url);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: ctl.signal, redirect: 'follow',
      });
      const text = await res.text();
      clearTimeout(t);
      if (res.status !== 200) throw new Error('HTTP ' + res.status + ' for ' + url);
      return { status: res.status, url: res.url, text };
    } catch (e) { clearTimeout(t); lastErr = e; if (attempt < 3) await sleep(1000 * 2 ** (attempt - 1)); }
  }
  throw lastErr;
}

function num(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function parseMarket($) {
  const indexName = clean($('#tracker option').first().text()) || 'KSE 100';
  const vols = $('#activity td#volume, table#activity td#volume').map((i, el) => clean($(el).text())).get();
  // Fallback: query by id directly (the page reuses id="volume" twice)
  const volEls = $('[id="volume"]').map((i, el) => clean($(el).text())).get();
  const volume = volEls[0] || null;
  const prevClose = volEls[1] || null;
  let marketStatus = null;
  $('#activity tr, table tr').each((i, tr) => {
    const cells = $(tr).find('td').map((k, td) => clean($(td).text())).get();
    if (cells[0] && /^market status$/i.test(cells[0])) marketStatus = cells[1] || null;
  });
  return {
    name: indexName,
    price: num($('#curIndex').text()),
    change: num($('#cahnge').text()),
    changePercent: num($('#percentchange').text()),
    high: num($('#high').text()),
    low: num($('#low').text()),
    volume: num(volume),
    prevClose: num(prevClose),
    valueTraded: num($('#value').text()),
    marketStatus,
  };
}

module.exports = {
  id: 'psx',
  name: 'Pakistan Stock Exchange',
  country: 'PK',
  category: 'stock_market',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 17,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 1, maxResults: 5 },
  endpoints: { latest: BASE + '/', search: null },
  selectors: {
    list: ['table#activity'],
    title: [],
    link: [],
    image: [],
    date: [],
    market: ['#curIndex', '#cahnge', '#percentchange', '#high', '#low', '#volume', '#value', 'select#tracker'],
  },
  schedule: { frequency: 'high' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 5, 5);
    const { text } = await fetchText(BASE + '/');
    await sleep(1500);
    const $ = cheerio.load(text);
    const m = parseMarket($);
    if (m.price == null) return [];
    const rec = {
      name: m.name,
      symbol: m.name.replace(/\s+/g, '').toUpperCase(),
      price: m.price,
      change: m.change,
      changePercent: m.changePercent,
      currency: 'PKR',
      volume: m.volume,
      url: BASE + '/',
      metadata: {
        high: m.high, low: m.low, previousClose: m.prevClose,
        valueTraded: m.valueTraded, marketStatus: m.marketStatus,
        note: 'Figures as published on the PSX homepage market-highlights table; default index shown by the site.',
      },
    };
    return [this.normalize(rec)].slice(0, limit);
  },

  async search(/* query, opts = {} */) {
    return { supported: false, reason: 'PSX adapter serves market index data only; no site text search is used.' };
  },

  async scrape(url /* , opts = {} */) {
    const u = String(url || '');
    if (!u.startsWith(BASE + '/')) return null;
    const rows = await this.latest({ limit: 1 });
    return rows[0] || null;
  },

  normalize(raw) {
    return {
      source: 'Pakistan Stock Exchange',
      category: 'stock_market',
      symbol: raw.symbol || null,
      name: raw.name || null,
      price: raw.price ?? null,
      change: raw.change ?? null,
      changePercent: raw.changePercent ?? null,
      currency: raw.currency || 'PKR',
      volume: raw.volume ?? null,
      url: raw.url || null,
      metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
    };
  },
};
