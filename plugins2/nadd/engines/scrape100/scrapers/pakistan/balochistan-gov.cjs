'use strict';
/* Government of Balochistan portal — balochistan.gov.pk
 * transport: http (server-rendered HTML).
 * Verified 2026-10-05:
 *  - An official RSS feed exists (/feed/, 10 items) but every item has an
 *    empty title/description and the linked pages carry no article titles —
 *    the feed is unusable, so it is NOT used.
 *  - The homepage is a static portal; latest() returns its published
 *    navigation/footer directory entries (departments, about, services) as
 *    government records, deduplicated by canonical URL.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://balochistan.gov.pk';

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

function canonicalize(raw) {
  try {
    const u = new URL(raw, BASE);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|igshid|mc_)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch { return String(raw || ''); }
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function parseDirectory($, limit) {
  const seen = new Set();
  const out = [];
  $('nav a[href], footer a[href]').each((i, el) => {
    if (out.length >= limit) return false;
    const href = $(el).attr('href') || '';
    if (!/^https?:\/\//i.test(href) || href === '#' || /^(javascript:|mailto:)/i.test(href)) return;
    const title = clean($(el).text());
    if (title.length < 3 || title.length > 100) return;
    if (/^(home|skip to)/i.test(title)) return;
    const url = canonicalize(href);
    if (seen.has(url)) return;
    if (url.replace(/\/$/, '') === BASE) return; // skip self-root logo link
    seen.add(url);
    out.push({ title, url });
  });
  return out;
}

module.exports = {
  id: 'balochistan-gov',
  name: 'Balochistan Government',
  country: 'PK',
  category: 'government',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 25,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 1, maxResults: 30 },
  endpoints: { latest: BASE + '/', search: null },
  selectors: {
    list: ['nav a[href]', 'footer a[href]'],
    title: ['nav a[href]', 'footer a[href]'],
    link: ['nav a[href]', 'footer a[href]'],
    image: [],
    date: [],
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    const { text } = await fetchText(BASE + '/');
    const $ = cheerio.load(text);
    return parseDirectory($, limit).map((r) => this.normalize(r));
  },

  async search(/* query, opts = {} */) {
    return { supported: false, reason: 'Portal site; no public search endpoint verified on balochistan.gov.pk.' };
  },

  async scrape(url /* , opts = {} */) {
    const u = String(url || '');
    if (!u.startsWith(BASE)) return null;
    const { text } = await fetchText(u);
    const $ = cheerio.load(text);
    const title = clean($('title').text()).split('|')[0].trim() || clean($('h1').first().text()) || null;
    if (!title) return null;
    return this.normalize({ title, url: canonicalize(u), description: clean($('meta[name="description"]').attr('content')) || null });
  },

  normalize(raw) {
    return {
      source: 'Balochistan Government',
      sourceUrl: BASE + '/',
      category: 'government',
      title: raw.title || null,
      description: raw.description || 'Official portal directory entry published on balochistan.gov.pk.',
      content: null,
      url: raw.url || null,
      image: null,
      author: 'Government of Balochistan',
      publishedAt: null,
      updatedAt: null,
      country: 'PK',
      language: 'en',
      tags: ['directory'],
      metadata: {},
      scrapedAt: new Date().toISOString(),
    };
  },
};
