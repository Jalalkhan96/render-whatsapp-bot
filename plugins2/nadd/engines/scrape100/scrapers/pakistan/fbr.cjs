'use strict';
/* Federal Board of Revenue — fbr.gov.pk (public notices / press releases)
 * transport: http (server-rendered HTML).
 * Verified 2026-10-05:
 *  - Press-release listing: https://www.fbr.gov.pk/pr
 *    cards: .thumbnailNewsItems .caption > a[href^="/pr/"];
 *    title in h4, publish date in span.btn-success ("Sep 30, 2026"),
 *    thumbnail img.pressReleaseFeaturedImage.
 *  - Detail page (/pr/<slug>/<id>): title in h2/h3, body in .MainContentArea,
 *    date in .btn-success.
 * No search endpoint verified on the site.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://www.fbr.gov.pk';
const LIST_URL = BASE + '/pr';

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

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
function parseDate(s) {
  const m = clean(s).match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${String(m[2]).padStart(2, '0')}T00:00:00+05:00`;
}

module.exports = {
  id: 'fbr',
  name: 'FBR',
  country: 'PK',
  category: 'government',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 19,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: LIST_URL, search: null },
  selectors: {
    list: ['.thumbnailNewsItems .caption'],
    title: ['.thumbnailNewsItems .caption h4'],
    link: ['.thumbnailNewsItems .caption a[href^="/pr/"]'],
    image: ['.thumbnailNewsItems img.pressReleaseFeaturedImage'],
    date: ['.thumbnailNewsItems .caption span.btn-success'],
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    const { text } = await fetchText(LIST_URL);
    await sleep(1500);
    const $ = cheerio.load(text);
    const seen = new Set();
    const out = [];
    $('.thumbnailNewsItems .caption').each((i, cap) => {
      if (out.length >= limit) return false;
      const $c = $(cap);
      const a = $c.find('a[href^="/pr/"]').first();
      const href = a.attr('href');
      if (!href) return;
      const url = canonicalize(href);
      if (seen.has(url)) return;
      const title = clean($c.find('h4').first().text());
      if (!title) return;
      const card = $c.closest('.thumbnailNewsItems');
      const img = card.find('img.pressReleaseFeaturedImage').first().attr('src') || null;
      seen.add(url);
      out.push({
        title, url, image: img,
        description: null,
        publishedAt: parseDate($c.find('span.btn-success').first().text()),
      });
    });
    return out.map((r) => this.normalize(r));
  },

  async search(/* query, opts = {} */) {
    return { supported: false, reason: 'No public search endpoint verified on fbr.gov.pk; use latest() over the press-release listing.' };
  },

  async scrape(url /* , opts = {} */) {
    const u = String(url || '');
    if (!u.includes('fbr.gov.pk/pr/')) return null;
    const { text } = await fetchText(u);
    const $ = cheerio.load(text);
    const title = clean($('h2, h3').first().text()) || clean($('title').text()) || null;
    if (!title) return null;
    const bodyText = clean($('.MainContentArea').text());
    const content = bodyText && bodyText.length > title.length ? bodyText.slice(title.length).trim() : bodyText;
    const ogImage = $('meta[property="og:image"]').attr('content') || null;
    return this.normalize({
      title,
      url: canonicalize(u),
      image: ogImage,
      description: content ? content.slice(0, 300) : null,
      content: content || null,
      publishedAt: parseDate($('.btn-success').first().text()),
    });
  },

  normalize(raw) {
    return {
      source: 'FBR',
      sourceUrl: BASE + '/',
      category: 'government',
      title: raw.title || null,
      description: raw.description || null,
      content: raw.content || null,
      url: raw.url || null,
      image: raw.image || null,
      author: 'Federal Board of Revenue',
      publishedAt: raw.publishedAt || null,
      updatedAt: null,
      country: 'PK',
      language: 'en',
      tags: ['press-release', 'tax'],
      metadata: {},
      scrapedAt: new Date().toISOString(),
    };
  },
};
