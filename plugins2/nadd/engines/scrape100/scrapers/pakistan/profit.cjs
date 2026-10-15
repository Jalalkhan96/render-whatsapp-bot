'use strict';
/* Profit by Pakistan Today — profit.pakistantoday.com.pk
 * transport: http (server-rendered HTML, Next.js).
 * Verified 2026-10-05:
 *  - Homepage cards: <article> blocks; story link matches /YYYY/MM/DD/slug,
 *    title in h1/h2/h3, category label in a <span>, thumbnail in <img>.
 *  - Article pages: JSON-LD NewsArticle (headline/description/image/
 *    datePublished/author), meta article:published_time + article:author,
 *    body paragraphs inside [class*=prose].
 *  - Search: /search?q=<query> returns 200 with the same card markup.
 * Listing cards carry no dates; the publish date is taken from the URL path
 * (/YYYY/MM/DD/). No per-article fetch in latest() — use scrape() for that.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://profit.pakistantoday.com.pk';
const DATE_RE = /\/(20\d{2})\/(\d{2})\/(\d{2})\//;

async function fetchText(url, timeoutMs = 25000, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
  let lastErr = new Error('fetch failed: ' + url);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
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
function absUrl(href) { try { return new URL(href, BASE).toString(); } catch { return null; } }
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function dateFromPath(path) {
  const m = String(path || '').match(DATE_RE);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00+05:00`;
}

function parseCards($, limit) {
  const seen = new Set();
  const out = [];
  $('a[href]').each((i, el) => {
    if (out.length >= limit) return false;
    const href = $(el).attr('href') || '';
    if (!DATE_RE.test(href)) return;
    const url = canonicalize(href);
    if (!url || seen.has(url)) return;
    const $link = $(el);
    // Title: heading inside the link, else the nearest ancestor that pairs
    // this link with a heading (card markup varies across homepage sections).
    let title = clean($link.find('h1, h2, h3').first().text());
    let scope = null;
    if (title) {
      scope = $link.closest('div');
    } else {
      let p = $link.parent();
      for (let d = 0; d < 6 && p.length && !scope; d++, p = p.parent()) {
        const h = p.find('h1, h2, h3').first();
        if (h.length && clean(h.text())) { title = clean(h.text()); scope = p; }
      }
    }
    if (!title || !scope || !scope.length) return;
    // Image ONLY from inside the card scope itself (many cards are text-only;
    // never widen outward, which would attach a neighboring card's image).
    const img = scope.find('img').first();
    const image = img.length ? absUrl(img.attr('src') || img.attr('data-src') || '') : null;
    const label = clean(scope.find('span').first().text()) || null;
    seen.add(url);
    out.push({ title, url, image: image || null, category: label, publishedAt: dateFromPath(href) });
  });
  return out;
}

function jsonLdNewsArticle($) {
  let found = null;
  $('script[type="application/ld+json"]').each((i, el) => {
    if (found) return;
    try {
      const docs = JSON.parse($(el).text());
      const flat = [];
      (Array.isArray(docs) ? docs : [docs]).forEach((d) => {
        flat.push(d);
        if (d && Array.isArray(d['@graph'])) flat.push(...d['@graph']);
      });
      found = flat.find((d) => d && (d['@type'] === 'NewsArticle' || (Array.isArray(d['@type']) && d['@type'].includes('NewsArticle')))) || null;
    } catch { /* ignore malformed blocks */ }
  });
  return found;
}

module.exports = {
  id: 'profit',
  name: 'Profit Pakistan Today',
  country: 'PK',
  category: 'business',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 16,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: BASE + '/', search: BASE + '/api/search/suggest?q={query}' },
  selectors: {
    list: ['article', 'div.mb-4', 'div.flex.gap-3', 'div.mb-9', 'div.text-center'],
    title: ['article h1', 'article h2', 'article h3', 'a[href^="/20"] h1', 'a[href^="/20"] h2', 'a[href^="/20"] h3'],
    link: ['a[href^="/20"]'],
    image: ['img'],
    date: ['meta[property="article:published_time"]'],
  },
  schedule: { frequency: 'high' },

  async latest(opts = {}) {
    const limit = Math.min(opts.limit || 30, 30);
    const { text } = await fetchText(BASE + '/');
    await sleep(1500);
    const $ = cheerio.load(text);
    return parseCards($, limit).map((r) => this.normalize(r));
  },

  async search(query, opts = {}) {
    // Official public JSON endpoint (discovered in the site's own JS bundle;
    // verified live): /api/search/suggest?q=. The server-rendered /search
    // page carries no result markup (results are client-rendered), so the
    // JSON endpoint is the only working search path.
    if (!query || !String(query).trim()) return { supported: false, reason: 'Empty query' };
    const limit = Math.min(opts.limit || 30, 30);
    const { text } = await fetchText(BASE + '/api/search/suggest?q=' + encodeURIComponent(String(query).trim()), 25000, 'application/json');
    await sleep(1500);
    let j;
    try { j = JSON.parse(text); } catch { return []; }
    const sugs = Array.isArray(j.suggestions) ? j.suggestions : [];
    const seen = new Set();
    const out = [];
    for (const s of sugs) {
      if (out.length >= limit) break;
      if (!s || !s.slug) continue;
      const d = new Date((s.publishedAt || 0) * 1000);
      if (Number.isNaN(d.getTime())) continue;
      const path = '/' + d.getUTCFullYear() + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + s.slug;
      const url = canonicalize(path);
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(this.normalize({
        title: clean(s.rawTitle || s.title),
        url,
        image: s.featuredImage || null,
        description: null,
        content: null,
        author: clean(s.authorName) || null,
        publishedAt: d.toISOString(),
        category: clean(s.category) || null,
      }));
    }
    return out;
  },

  async scrape(url, opts = {}) {
    const { text } = await fetchText(String(url));
    const $ = cheerio.load(text);
    const jld = jsonLdNewsArticle($);
    const og = (p) => $('meta[property="' + p + '"]').attr('content') || null;
    const title = (jld && clean(jld.headline)) || clean(og('og:title')) || clean($('title').text()) || null;
    if (!title) return null;
    let author = (jld && jld.author && (jld.author.name || (Array.isArray(jld.author) ? jld.author.map((a) => a.name).join(', ') : null))) || $('meta[property="article:author"]').attr('content') || null;
    author = clean(author) || null;
    const publishedAt = (jld && jld.datePublished) || og('article:published_time') || dateFromPath(String(url)) || null;
    const image = (jld && (Array.isArray(jld.image) ? jld.image[0] : jld.image)) || og('og:image') || null;
    const desc = (jld && clean(jld.description)) || clean(og('og:description')) || null;
    let content = null;
    const prose = $('[class*=prose] p');
    const paras = (prose.length ? prose : $('main p')).map((i, el) => clean($(el).text())).get().filter((p) => p.length > 20);
    if (paras.length) content = paras.join('\n\n');
    const rec = {
      title, url: canonicalize(String(url)), image: image ? absUrl(image) || image : null,
      description: desc, content, author, publishedAt,
      tags: $('meta[property="article:tag"]').map((i, el) => clean($(el).attr('content'))).get().filter(Boolean),
    };
    return this.normalize(rec);
  },

  normalize(raw) {
    return {
      source: 'Profit Pakistan Today',
      sourceUrl: BASE + '/',
      category: 'business',
      title: raw.title || null,
      description: raw.description || null,
      content: raw.content || null,
      url: raw.url || null,
      image: raw.image || null,
      author: raw.author || null,
      publishedAt: raw.publishedAt || null,
      updatedAt: null,
      country: 'PK',
      language: 'en',
      tags: raw.category ? [raw.category] : (raw.tags || []),
      metadata: { section: raw.category || null },
      scrapedAt: new Date().toISOString(),
    };
  },
};
