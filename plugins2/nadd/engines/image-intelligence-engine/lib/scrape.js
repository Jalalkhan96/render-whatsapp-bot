'use strict';
/**
 * Lightweight HTML scraping helpers (regex-based, zero deps).
 * Adapters must use these for transport but keep SELECTORS per-site.
 */
const { get } = require('./http');

async function fetchHtml(http, url, opts = {}) {
  const getter = (http && http.get) || get;
  const r = await getter(url, { maxBytes: opts.maxBytes || 2 * 1024 * 1024, timeout: opts.timeout });
  if (r.status >= 400) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.body.toString('utf8');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
}

function extractOpenGraph(html) {
  const og = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const prop = attr(tag, 'property') || attr(tag, 'name');
    const content = attr(tag, 'content');
    if (!prop || !content) continue;
    if (/^og:/i.test(prop)) og[prop.slice(3).toLowerCase()] = content;
    else if (/^twitter:/i.test(prop)) og['twitter_' + prop.slice(8).toLowerCase()] = content;
  }
  return og;
}

function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim());
      if (Array.isArray(j)) out.push(...j);
      else if (j && typeof j === 'object') out.push(j);
    } catch (_) { /* malformed JSON-LD, skip */ }
  }
  return out;
}

function absolutizeUrl(u, base) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s || s.startsWith('data:') || s.startsWith('javascript:')) return '';
  try { return new URL(s, base).toString(); } catch (_) { return ''; }
}

function extractImages(html, baseUrl, limit = 60) {
  const imgs = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && imgs.length < limit) {
    const tag = m[0];
    const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original');
    const abs = absolutizeUrl(src, baseUrl);
    if (!abs) continue;
    if (/\/(logo|icon|sprite|pixel|avatar|blank)\b/i.test(abs) && !/photo|image|media|cdn/i.test(abs)) continue;
    imgs.push({
      src: abs,
      alt: attr(tag, 'alt') || '',
      width: parseInt(attr(tag, 'width') || '0', 10) || 0,
      height: parseInt(attr(tag, 'height') || '0', 10) || 0,
    });
  }
  return imgs;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanText(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

module.exports = {
  fetchHtml, extractOpenGraph, extractJsonLd, extractImages,
  absolutizeUrl, cleanText, decodeEntities, attr,
};
