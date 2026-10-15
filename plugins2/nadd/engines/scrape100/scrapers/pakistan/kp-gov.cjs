'use strict';
/* KP Government portal — kp.gov.pk
 * transport: api (official public JSON API behind the kp.gov.pk SPA).
 * Verified 2026-10-05:
 *  - API base discovered in the site's own public JS bundle:
 *      https://mgn1.kp.gov.pk/api
 *  - GET /api/news?page=N -> 200 Laravel-paginated JSON
 *    { data:[{uuid,title,slug,summary,body,image_path,published_at,...}],
 *      links, meta:{current_page,last_page} }
 *  - GET /api/news/<uuid> -> 200 single news object (verified live).
 *  - Frontend detail route in the same bundle: /news-detail/:id
 * Note: portal content is published in Urdu (no English variant exposed by
 * the API — ?lang=en returns the same Urdu items), so language is 'ur'.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://mgn1.kp.gov.pk/api';
const SITE = 'https://kp.gov.pk';

async function fetchJson(url, timeoutMs = 25000) {
  let lastErr = new Error('fetch failed: ' + url);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: ctl.signal, redirect: 'follow',
      });
      const text = await res.text();
      clearTimeout(t);
      if (res.status !== 200) throw new Error('HTTP ' + res.status + ' for ' + url);
      return JSON.parse(text);
    } catch (e) { clearTimeout(t); lastErr = e; if (attempt < 3) await sleep(1000 * 2 ** (attempt - 1)); }
  }
  throw lastErr;
}

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function stripHtml(html) {
  if (!html) return null;
  const $ = cheerio.load(String(html));
  const t = clean($.text());
  return t || null;
}
function toIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // DD/MM/YYYY as served by the API
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}T00:00:00+05:00`;
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = {
  id: 'kp-gov',
  name: 'KP Government',
  country: 'PK',
  category: 'government',
  baseUrl: SITE + '/',
  language: 'ur',
  enabled: true,
  priority: 23,
  transport: 'api',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: API + '/news?page=1', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] }, // API transport: JSON fields, not CSS
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    const maxPages = Math.min(opts.maxPages || 3, 3);
    const seen = new Set();
    const out = [];
    for (let page = 1; page <= maxPages && out.length < limit; page++) {
      const j = await fetchJson(API + '/news?page=' + page);
      const items = Array.isArray(j.data) ? j.data : [];
      if (!items.length) break;
      for (const it of items) {
        if (out.length >= limit) break;
        if (!it || !it.uuid || seen.has(it.uuid)) continue;
        seen.add(it.uuid);
        out.push(this.normalize({
          uuid: it.uuid,
          title: clean(it.title) || null,
          description: clean(it.summary) || null,
          content: stripHtml(it.body),
          image: it.image_path || null,
          publishedAt: toIso(it.published_at) || toIso(it.created_at),
        }));
      }
      await sleep(1500);
      const lastPage = j.meta && j.meta.last_page;
      if (lastPage && page >= lastPage) break;
    }
    return out;
  },

  async search(/* query, opts = {} */) {
    return { supported: false, reason: 'The public KP API exposes a paginated news list only (/api/news); no search parameter is available.' };
  },

  async scrape(url /* , opts = {} */) {
    const m = String(url || '').match(/news-detail\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!m) return null;
    const j = await fetchJson(API + '/news/' + m[1]);
    const it = j.data || j;
    if (!it || !it.title) return null;
    return this.normalize({
      uuid: it.uuid,
      title: clean(it.title),
      description: clean(it.summary) || null,
      content: stripHtml(it.body),
      image: it.image_path || null,
      publishedAt: toIso(it.published_at) || toIso(it.created_at),
    });
  },

  normalize(raw) {
    return {
      source: 'KP Government',
      sourceUrl: SITE + '/',
      category: 'government',
      title: raw.title || null,
      description: raw.description || null,
      content: raw.content || null,
      url: raw.uuid ? SITE + '/news-detail/' + raw.uuid : null,
      image: raw.image || null,
      author: 'Government of Khyber Pakhtunkhwa',
      publishedAt: raw.publishedAt || null,
      updatedAt: null,
      country: 'PK',
      language: 'ur',
      tags: ['press-release'],
      metadata: { uuid: raw.uuid || null },
      scrapedAt: new Date().toISOString(),
    };
  },
};
