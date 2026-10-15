'use strict';

const axios = require('axios');
const { URL } = require('url');

const SOURCES = {
  zerochan: {
    name: 'Zerochan',
    base: 'https://www.zerochan.net',
    search: q => `https://www.zerochan.net/search?query=${encodeURIComponent(q)}`,
  },
  safebooru: {
    name: 'Safebooru',
    base: 'https://safebooru.org',
    search: q => `https://safebooru.org/index.php?page=post&s=list&tags=${encodeURIComponent(`${q} rating:safe`)}`,
  },
  danbooru: {
    name: 'Danbooru',
    base: 'https://danbooru.donmai.us',
    search: q => `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(q)}`,
  },
  animepictures: {
    name: 'Anime-Pictures',
    base: 'https://anime-pictures.net',
    search: q => `https://anime-pictures.net/?lang=en&search_tag=${encodeURIComponent(q)}`,
  },
  eshuushuu: {
    name: 'e-shuushuu',
    base: 'https://e-shuushuu.net',
    search: q => `https://e-shuushuu.net/search/results/?tags=${encodeURIComponent(q)}`,
  },
  wallhaven: {
    name: 'Wallhaven',
    base: 'https://wallhaven.cc',
    search: q => `https://wallhaven.cc/search?q=${encodeURIComponent(q)}&categories=010&purity=100&sorting=relevance`,
  },
  alphacoders: {
    name: 'Alpha Coders / Wallpaper Abyss',
    base: 'https://wall.alphacoders.com',
    search: q => `https://wall.alphacoders.com/search.php?search=${encodeURIComponent(q)}`,
  },
};

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36';
const CACHE = new Map();
const CACHE_MS = 2 * 60 * 1000;

function decodeHtml(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function absoluteUrl(raw, pageUrl) {
  if (!raw) return null;
  raw = decodeHtml(raw.trim());
  if (raw.startsWith('data:')) return null;
  try {
    return new URL(raw, pageUrl).href;
  } catch (_) {
    return null;
  }
}

function extractImages(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const add = (raw, thumb = null, sourcePage = pageUrl) => {
    const url = absoluteUrl(raw, pageUrl);
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) return;
    if (!/\.(?:jpg|jpeg|png|webp|gif)(?:\?|#|$)/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, thumbnail: thumb ? absoluteUrl(thumb, pageUrl) : null, sourcePage });
  };

  const imgRe = /<img\b[^>]*>/gi;
  for (const m of html.matchAll(imgRe)) {
    const tag = m[0];
    const attrs = {};
    for (const a of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']+)["']/gi)) attrs[a[1].toLowerCase()] = a[2];
    const raw = attrs['data-original'] || attrs['data-src'] || attrs['data-lazy-src'] || attrs.src || attrs['srcset']?.split(',')[0]?.trim().split(' ')[0];
    add(raw, attrs.src || attrs['data-src']);
  }

  // OpenGraph image / Twitter cards are frequently the original/large image.
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (content && (prop === 'og:image' || prop === 'twitter:image')) add(content);
  }

  // Linked full-size images.
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    add(m[1]);
  }

  return out;
}

function titleFromHtml(html) {
  const og = /<meta\b[^>]*(?:property|name)\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  if (og) return decodeHtml(og);
  return decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url) {
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.html;
  const r = await axios.get(url, {
    timeout: 18000,
    responseType: 'text',
    maxContentLength: 7 * 1024 * 1024,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    validateStatus: s => s >= 200 && s < 400,
  });
  const html = String(r.data || '');
  CACHE.set(url, { at: Date.now(), html });
  return html;
}

async function searchSource(source, query, limit = 10) {
  const cfg = SOURCES[source];
  if (!cfg) throw new Error(`Unknown source: ${source}`);
  const pageUrl = cfg.search(query);
  const html = await fetchHtml(pageUrl);
  const images = extractImages(html, pageUrl).slice(0, Math.max(1, Math.min(25, limit)));
  return { source, sourceName: cfg.name, query, pageUrl, title: titleFromHtml(html), images };
}

async function searchAll(query, { limit = 5, sources = Object.keys(SOURCES) } = {}) {
  const selected = sources.filter(s => SOURCES[s]);
  const settled = await Promise.allSettled(selected.map(s => searchSource(s, query, limit)));
  const results = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(r.value);
    else errors.push({ source: selected[i], error: r.reason?.message || String(r.reason) });
  });
  return { query, results, errors };
}

async function scrapeUrl(url, limit = 15) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only public http/https URLs are supported');
  const html = await fetchHtml(url);
  return { url, title: titleFromHtml(html), images: extractImages(html, url).slice(0, Math.max(1, Math.min(30, limit))) };
}

function getSources() { return Object.entries(SOURCES).map(([id, v]) => ({ id, name: v.name, base: v.base })); }

module.exports = { SOURCES, getSources, searchSource, searchAll, scrapeUrl, extractImages };
