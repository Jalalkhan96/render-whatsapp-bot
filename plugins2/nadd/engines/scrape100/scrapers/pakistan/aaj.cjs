'use strict';
/* undefined scraper adapter — generated. Self-contained: only cheerio + global fetch. */
const cheerio = require('cheerio');

const CFG = {
  "id": "aaj",
  "name": "Aaj",
  "baseUrl": "https://www.aaj.tv/",
  "language": "ur",
  "priority": 8,
  "transport": "rss",
  "providerRequiredReason": null,
  "country": "PK",
  "category": "pakistan_news",
  "limits": {
    "maxPages": 3,
    "maxResults": 30
  },
  "endpoints": {
    "latest": "https://www.aaj.tv/feeds/home",
    "search": null
  },
  "selectors": {
    "list": [],
    "title": [],
    "link": [],
    "image": [],
    "date": []
  },
  "card": null,
  "articleBody": [
    ".story__content",
    "[itemprop=\"articleBody\"]",
    "article"
  ]
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, attempt) {
  attempt = attempt || 1;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < 3) {
      await sleep(1000 * Math.pow(2, attempt - 1));
      return fetchText(url, attempt + 1);
    }
    throw err;
  }
}

function canonicalize(rawUrl, base) {
  try {
    const u = new URL(rawUrl, base);
    for (const k of Array.from(u.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|mc_|igshid|mcid|_ga|yclid)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.toString();
  } catch (e) { return rawUrl || null; }
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load('<div>' + html + '</div>');
  return $('div').text().replace(/\s+/g, ' ').trim();
}

function absUrl(maybeRel, base) {
  if (!maybeRel) return null;
  try { return new URL(maybeRel, base).toString(); } catch (e) { return null; }
}

/* ---------- RSS parsing (namespace-agnostic) ---------- */
function rssChildren($item) { return $item.children().toArray(); }
function childText($, $item, local) {
  const kids = $item.children();
  for (let i = 0; i < kids.length; i++) {
    const tn = (kids[i].tagName || '').toLowerCase().split(':').pop();
    if (tn === local) return $(kids[i]).text().trim();
  }
  return '';
}
function childAttr($, $item, local, attr) {
  const kids = $item.children();
  for (let i = 0; i < kids.length; i++) {
    const tn = (kids[i].tagName || '').toLowerCase().split(':').pop();
    if (tn === local) return $(kids[i]).attr(attr) || null;
  }
  return null;
}
function firstImgInHtml(html) {
  if (!html) return null;
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : null;
}
function parseRssDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function rssImage($, $item) {
  // 1. enclosure with image type
  const kids = $item.children();
  for (let i = 0; i < kids.length; i++) {
    const tn = (kids[i].tagName || '').toLowerCase().split(':').pop();
    const el = $(kids[i]);
    if (tn === 'enclosure') {
      const t = (el.attr('type') || '');
      if (!t || t.indexOf('image') === 0) return el.attr('url') || null;
    }
    if (tn === 'content' && (el.attr('medium') === 'image' || (el.attr('type') || '').indexOf('image') === 0)) {
      if (el.attr('url')) return el.attr('url');
    }
    if (tn === 'thumbnail' && el.attr('url')) return el.attr('url');
    if (tn === 'image') { // e.g. <image><img src="..."/></image>
      const src = el.find('img').attr('src') || el.attr('url');
      if (src) return src;
    }
  }
  // 2. first img inside description / content:encoded
  return firstImgInHtml(childText($, $item, 'encoded')) || firstImgInHtml(childText($, $item, 'description'));
}
function parseRss(xml, base) {
  const $ = cheerio.load(xml, { xml: true });
  const out = [];
  $('item').each((i, el) => {
    const $item = $(el);
    const title = childText($, $item, 'title');
    const link = childText($, $item, 'link') || childText($, $item, 'guid');
    if (!title || !link) return;
    const descHtml = childText($, $item, 'description');
    const encoded = childText($, $item, 'encoded');
    const descText = htmlToText(descHtml);
    const fullText = htmlToText(encoded);
    const author = childText($, $item, 'creator') || childText($, $item, 'author') || null;
    const catRaw = childText($, $item, 'category');
    out.push({
      title: title,
      url: absUrl(link, base),
      description: descText || fullText.slice(0, 280) || '',
      content: fullText || descText || '',
      image: absUrl(rssImage($, $item), base),
      author: author || null,
      publishedAt: parseRssDate(childText($, $item, 'pubdate')),
      tags: catRaw ? catRaw.split(/[,|]/).map((s) => s.trim()).filter(Boolean) : [],
      guid: childText($, $item, 'guid') || null,
    });
  });
  return out;
}

/* ---------- HTML list parsing ---------- */
function firstMatch($, $ctx, sels) {
  for (const s of sels || []) {
    if (s === '') return $ctx; // the card itself
    const el = $ctx.find(s).first();
    if (el && el.length) return el;
  }
  return null;
}
function decodeSamaaSrcset(srcset) {
  if (!srcset) return null;
  const parts = srcset.split(',');
  for (const p of parts) {
    const m = /[?&]url=([^&\s]+)/.exec(p);
    if (m) {
      try {
        const u = decodeURIComponent(m[1]);
        if (/^https?:\/\//.test(u) && !u.includes('load.jpg')) return u;
      } catch (e) {}
    }
  }
  return null;
}
function cardImage($, $card, spec, base) {
  let scope = $card;
  if (spec && spec.fromParent) scope = $card.parent();
  if (spec && spec.closest) { const c = $card.closest(spec.closest); if (c && c.length) scope = c; }
  const el = firstMatch($, scope, (spec && spec.sels) || ['img']);
  if (!el) return null;
  if (spec && spec.srcsetDecode) {
    const d = decodeSamaaSrcset(el.attr('srcset'));
    if (d) return absUrl(d, base);
  }
  for (const a of (spec && spec.attrs) || ['src']) {
    const v = el.attr(a);
    if (v && !/^data:/.test(v)) return absUrl(v, base);
  }
  const fb = el.attr('src');
  return fb && !/^data:/.test(fb) ? absUrl(fb, base) : null;
}
function parseHtmlList(html, base) {
  const $ = cheerio.load(html);
  const spec = CFG.card;
  let cards = [];
  for (const s of CFG.selectors.list) {
    const found = $(s).toArray();
    if (found.length) { cards = found; break; }
  }
  const out = [];
  for (const c of cards) {
    const $card = $(c);
    const $t = firstMatch($, $card, spec.title.sels);
    let title = $t ? $t.text().replace(/\s+/g, ' ').trim() : '';
    if (!title && $t && spec.title.attrs) {
      for (const at of spec.title.attrs) {
        const v = $t.attr(at);
        if (v && v.trim()) { title = v.trim(); break; }
      }
    }
    const $l = firstMatch($, $card, spec.link.sels);
    let href = $l ? ($l.attr('href') || ($l.is('a') ? $l.attr('href') : null)) : null;
    if (spec.link.match && href && !(new RegExp(spec.link.match)).test(href)) href = null;
    if (!title || !href) continue;
    const $d = spec.date ? firstMatch($, $card, spec.date.sels) : null;
    let pub = null;
    if ($d) {
      for (const a of spec.date.attrs || ['datetime']) {
        const v = $d.attr(a);
        if (v) { pub = parseRssDate(v); if (pub) break; }
      }
      if (!pub) pub = parseRssDate($d.text().trim());
    }
    out.push({
      title: title,
      url: absUrl(href, base),
      description: '',
      content: '',
      image: cardImage($, $card, spec.image, base),
      author: null,
      publishedAt: pub,
      tags: [],
    });
  }
  return out;
}

/* ---------- Article page parsing: JSON-LD -> OpenGraph -> CSS ---------- */
function parseArticle(html, url) {
  const $ = cheerio.load(html);
  let rec = { title: '', description: '', content: '', image: null, author: null, publishedAt: null, tags: [] };

  // 1. JSON-LD
  let ld = null;
  $('script[type="application/ld+json"]').each((i, s) => {
    if (ld) return;
    try {
      const raw = $(s).html() || '';
      const docs = [];
      // handle concatenated JSON objects defensively
      try { docs.push(JSON.parse(raw)); } catch (e) { return; }
      for (const doc of docs) {
        const nodes = doc['@graph'] && Array.isArray(doc['@graph']) ? doc['@graph'] : [doc];
        for (const n of nodes) {
          if (!n || typeof n !== 'object') continue;
          const t = n['@type'] || '';
          if (/^(NewsArticle|Article|BlogPosting|ReportageNewsArticle|WebPage)$/.test(t)) { ld = n; break; }
        }
        if (ld) break;
      }
    } catch (e) {}
  });
  const ldVal = (o, k) => (o && o[k] != null ? o[k] : null);
  const ldStr = (v) => (typeof v === 'string' ? v : (v && v.name) || (Array.isArray(v) ? v.map((x) => x.name || x).filter(Boolean).join(', ') : null));
  if (ld) {
    rec.title = ldStr(ldVal(ld, 'headline')) || '';
    rec.description = ldStr(ldVal(ld, 'description')) || '';
    const body = ldVal(ld, 'articleBody');
    rec.content = typeof body === 'string' ? body : '';
    const img = ldVal(ld, 'image');
    rec.image = typeof img === 'string' ? img : (img && (img.url || (Array.isArray(img) && img[0] && (img[0].url || img[0])))) || null;
    rec.author = ldStr(ldVal(ld, 'author'));
    rec.publishedAt = parseRssDate(ldVal(ld, 'datePublished'));
    const kw = ldVal(ld, 'keywords');
    rec.tags = typeof kw === 'string' ? kw.split(',').map((s) => s.trim()).filter(Boolean) : (Array.isArray(kw) ? kw : []);
  }

  // 2. OpenGraph / meta
  const meta = (sel) => $(sel).attr('content') || null;
  if (!rec.title) rec.title = meta('meta[property="og:title"]') || $('title').text().trim() || '';
  if (!rec.description) rec.description = meta('meta[property="og:description"]') || meta('meta[name="description"]') || '';
  if (!rec.image) rec.image = meta('meta[property="og:image"]') || null;
  if (!rec.publishedAt) rec.publishedAt = parseRssDate(meta('meta[property="article:published_time"]') || meta('meta[name="publish-date"]') || meta('meta[itemprop="datePublished"]'));
  if (!rec.publishedAt) {
    const epoch = meta('meta[property="og:updated_time"]');
    if (epoch && /^\d+$/.test(epoch.trim())) {
      const d = new Date(parseInt(epoch.trim(), 10) * 1000);
      if (!isNaN(d.getTime())) rec.publishedAt = d.toISOString();
    }
  }
  if (!rec.author) rec.author = meta('meta[name="author"]') || meta('meta[property="article:author"]') || null;

  // 3. CSS fallback for content (also used when JSON-LD body is just an excerpt)
  if (!rec.content || rec.content.length < 200) {
    for (const s of (CFG.articleBody || [])) {
      const el = $(s).first();
      if (el && el.length) {
        el.find('script, style, .ad, .advertisement, iframe').remove();
        const t = el.text().replace(/\s+/g, ' ').trim();
        if (t.length > rec.content.length && t.length > 120) { rec.content = t; break; }
      }
    }
  }
  rec.url = url;
  return rec;
}

/* ---------- WordPress API (humnews) ---------- */
function wpPostToRaw(p) {
  const emb = p._embedded || {};
  const media = emb['wp:featuredmedia'] && emb['wp:featuredmedia'][0];
  const terms = (emb['wp:term'] || []).flat().map((t) => t.name).filter(Boolean);
  return {
    title: htmlToText((p.title && p.title.rendered) || ''),
    url: p.link || null,
    description: htmlToText((p.excerpt && p.excerpt.rendered) || '').slice(0, 400),
    content: htmlToText((p.content && p.content.rendered) || ''),
    image: (media && media.source_url) || null,
    author: (p._embedded && p._embedded.author && p._embedded.author[0] && p._embedded.author[0].name) || null,
    publishedAt: p.date ? new Date(p.date).toISOString() : null,
    updatedAt: p.modified ? new Date(p.modified).toISOString() : null,
    tags: terms,
  };
}
async function latestApi(opts) {
  opts = opts || {};
  const limit = Math.min(opts.limit || CFG.limits.maxResults, CFG.limits.maxResults);
  await sleep(250);
  const u = CFG.endpoints.latest + (CFG.endpoints.latest.indexOf('?') >= 0 ? '&' : '?') + 'per_page=' + limit + '&_embed=wp:term,wp:featuredmedia,author';
  const res = await fetchText(u);
  let arr;
  try { arr = JSON.parse(res); } catch (e) { throw new Error('Invalid JSON from API'); }
  if (!Array.isArray(arr)) throw new Error('Unexpected API shape');
  return arr.slice(0, limit).map(wpPostToRaw);
}

function normalize(raw) {
  const now = new Date().toISOString();
  return {
    source: CFG.name,
    sourceUrl: CFG.baseUrl,
    category: CFG.category,
    title: (raw.title || '').trim() || null,
    description: (raw.description || '').trim() || null,
    content: (raw.content || '').trim() || null,
    url: raw.url ? canonicalize(raw.url, CFG.baseUrl) : null,
    image: raw.image ? canonicalize(raw.image, CFG.baseUrl) : null,
    author: raw.author || null,
    publishedAt: raw.publishedAt || null,
    updatedAt: raw.updatedAt || null,
    country: CFG.country,
    language: CFG.language,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    metadata: { guid: raw.guid || null },
    scrapedAt: now,
  };
}

function dedupe(recs) {
  const seen = new Set();
  const out = [];
  for (const r of recs) {
    if (!r.url || !r.title) continue;
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

async function latestRss(opts) {
  opts = opts || {};
  const limit = Math.min(opts.limit || CFG.limits.maxResults, CFG.limits.maxResults);
  await sleep(250);
  const xml = await fetchText(CFG.endpoints.latest);
  const raws = parseRss(xml, CFG.baseUrl);
  return dedupe(raws).slice(0, limit).map(normalize);
}
async function latestHtml(opts) {
  opts = opts || {};
  const limit = Math.min(opts.limit || CFG.limits.maxResults, CFG.limits.maxResults);
  await sleep(250);
  const html = await fetchText(CFG.endpoints.latest);
  const raws = parseHtmlList(html, CFG.baseUrl);
  return dedupe(raws).slice(0, limit).map(normalize);
}

module.exports = {
  id: CFG.id,
  name: CFG.name,
  country: CFG.country,
  category: CFG.category,
  baseUrl: CFG.baseUrl,
  language: CFG.language,
  enabled: true,
  priority: CFG.priority,
  transport: CFG.transport,
  providerRequiredReason: CFG.providerRequiredReason || null,
  rateLimit: { delayMs: 1000 },
  limits: CFG.limits,
  endpoints: { latest: CFG.endpoints.latest, search: CFG.endpoints.search || null },
  selectors: CFG.selectors,
  schedule: { frequency: 'high' },

  async latest(opts) {
    opts = opts || {};
    if (CFG.transport === 'provider-required') return [];
    if (CFG.transport === 'rss') return latestRss(opts);
    if (CFG.transport === 'api') return latestApi(opts);
    return latestHtml(opts);
  },

  async search(query, opts) {
    return { supported: false, reason: 'No verified search endpoint for ' + CFG.name };
  },

  async scrape(url, opts) {
    opts = opts || {};
    if (!url) return null;
    if (CFG.transport === 'provider-required') return null;
    await sleep(250);
    try {
      // humnews: prefer the official WP API by slug
      if (CFG.id === 'humnews') {
        const m = /\/latest\/(\d+)\/?$/.exec(url);
        if (m) {
          try {
            const j = JSON.parse(await fetchText('https://humnews.pk/wp-json/wp/v2/posts?slug=' + m[1] + '&_embed=wp:term,wp:featuredmedia,author'));
            if (Array.isArray(j) && j[0]) return normalize(Object.assign(wpPostToRaw(j[0]), { url: url }));
          } catch (e) { /* fall through to HTML */ }
        }
      }
      const html = await fetchText(canonicalize(url, CFG.baseUrl));
      const raw = parseArticle(html, canonicalize(url, CFG.baseUrl));
      if (!raw.title) return null;
      return normalize(raw);
    } catch (e) { return null; }
  },

  normalize: normalize,
};

