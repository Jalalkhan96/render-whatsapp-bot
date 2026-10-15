'use strict';
/* Extraction helpers shared by core: JSON-LD, OpenGraph, canonical URLs,
 * text cleaning, RSS parsing. (MASTER PROMPT §26, §32, §33) */
const cheerio = require('cheerio');
const crypto = require('crypto');

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'fbclid', 'gclid', 'gclsrc', 'msclkid', 'mc_cid', 'mc_eid',
  'igshid', '_ga', 'vero_id',
]);

function canonicalUrl(raw, base) {
  if (!raw) return '';
  try {
    const u = new URL(raw, base);
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) u.searchParams.delete(p);
    }
    u.hash = '';
    // normalize trailing slash on bare paths
    return u.toString();
  } catch (_) { return String(raw).trim(); }
}

function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function hashRecord(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
}

/* Extract all JSON-LD blocks; return array of parsed objects. */
function jsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).html() || '';
    try {
      const parsed = JSON.parse(txt.trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch (_) { /* malformed block — skip */ }
  });
  return out;
}

function findJsonLdType(blocks, types) {
  const want = new Set(types);
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const t = node['@type'];
    const ts = Array.isArray(t) ? t : [t];
    if (ts.some(x => want.has(x))) found.push(node);
    const g = node['@graph'];
    if (g) walk(g);
    // also walk nested objects (mainEntity etc.)
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  blocks.forEach(walk);
  return found;
}

function og($, prop) {
  return cleanText($(`meta[property="og:${prop}"]`).attr('content') || $(`meta[name="${prop}"]`).attr('content') || '');
}

/* Pick first non-empty value across versioned fallback selectors. */
function pick($, ctx, selectors) {
  for (const sel of selectors || []) {
    const el = ctx ? $(ctx).find(sel) : $(sel);
    if (el.length) {
      const v = cleanText(el.first().text());
      if (v) return v;
    }
  }
  return '';
}

function pickAttr($, ctx, selectors, attr) {
  for (const sel of selectors || []) {
    const el = ctx ? $(ctx).find(sel) : $(sel);
    if (el.length) {
      const v = (el.first().attr(attr) || '').trim();
      if (v) return v;
    }
  }
  return '';
}

/* Minimal RSS/Atom parser via cheerio xmlMode. Returns [{title,link,description,pubDate,image,author}]. */
function parseRss(xml, baseUrl) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  $('item, entry').each((_, el) => {
    const e = $(el);
    const title = cleanText(e.find('title').first().text());
    let link = e.find('link').first().text().trim() || e.find('link').first().attr('href') || '';
    if (!link) link = e.find('guid').first().text().trim();
    const desc = cleanText(e.find('description, summary').first().text());
    const pub = (e.find('pubDate, published, updated').first().text() || '').trim();
    let image = '';
    const enc = e.find('enclosure[url]').first().attr('url');
    if (enc) image = enc;
    else {
      const mthumb = e.find('media\\:thumbnail, thumbnail').first().attr('url');
      if (mthumb) image = mthumb;
    }
    const author = cleanText(e.find('author, dc\\:creator, creator').first().text());
    if (title || link) {
      items.push({
        title, link: canonicalUrl(link, baseUrl), description: desc,
        pubDate: pub, image, author,
      });
    }
  });
  return items;
}

function toISODate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

module.exports = {
  canonicalUrl, cleanText, hashRecord, jsonLd, findJsonLdType, og,
  pick, pickAttr, parseRss, toISODate,
};
