'use strict';

/**
 * ABIX GIF WEB SCRAPER — NO API KEYS
 *
 * Flat plugin intended for: /home/container/plugins2/gifscrape.js
 *
 * Existing commands `-gif` and `-gifsearch` are deliberately NOT registered.
 *
 * Commands:
 *   -gifscrape <query>
 *   -gifscrape <n> <query>
 *   -gifall <query>
 *   -gifweb <site> <query>
 *   -gifrandom [query]
 *   -gifsites
 *   -giftest <site> <query>
 *
 * All discovery is public web-page scraping. No API endpoint, API key,
 * account login, cookies, CAPTCHA bypass, or private endpoint is used.
 *
 * Optional browser fallback:
 *   npm i playwright
 *   npx playwright install chromium
 *
 * Runtime requirements:
 *   Node.js 20+
 *   ffmpeg recommended for WhatsApp-safe GIF/WebM -> MP4 conversion.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TMP_DIR = path.join(os.tmpdir(), 'abix-gif-web');
const MAX_RESULTS = envInt('GIF_WEB_MAX_RESULTS', 1, 6, 3);
const MAX_PER_SOURCE = envInt('GIF_WEB_MAX_PER_SOURCE', 1, 8, 3);
const MAX_BYTES = envInt('GIF_WEB_MAX_BYTES', 1 * 1024 * 1024, 20 * 1024 * 1024, 15 * 1024 * 1024);
const TIMEOUT_MS = envInt('GIF_WEB_TIMEOUT_MS', 5000, 45000, 15000);
const PAGE_TIMEOUT_MS = envInt('GIF_WEB_PAGE_TIMEOUT_MS', 5000, 90000, 30000);
const SOURCE_CONCURRENCY = envInt('GIF_WEB_SOURCE_CONCURRENCY', 1, 8, 4);
const DETAIL_PAGES = envInt('GIF_WEB_DETAIL_PAGES', 1, 10, 5);
const SCROLL_ROUNDS = envInt('GIF_WEB_SCROLL_ROUNDS', 0, 12, 4);
const CACHE_TTL_MS = envInt('GIF_WEB_CACHE_TTL_MS', 5000, 10 * 60 * 1000, 60 * 1000);
const COOLDOWN_MS = envInt('GIF_WEB_COOLDOWN_MS', 1000, 60000, 5000);
const SEND_DELAY_MS = envInt('GIF_WEB_SEND_DELAY_MS', 300, 5000, 900);

const UA = process.env.GIF_WEB_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36 ABIX-GIF-Web/2.0';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Cache-Control': 'no-cache',
};

const cache = new Map();
const busy = new Set();
const lastRun = new Map();
let playwrightModule;

function envInt(name, min, max, fallback) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'funny';
}

function isHttp(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function abs(raw, base) {
  try {
    const value = decodeEscapes(decodeHtml(String(raw || '').trim()));
    if (!value || value.startsWith('data:') || value.startsWith('javascript:') || value.startsWith('#')) return null;
    const u = new URL(value, base);
    return isHttp(u.href) ? u.href : null;
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/gi, '/');
}

function decodeEscapes(value) {
  return String(value || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003F/gi, '?')
    .replace(/\\u003D/gi, '=')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function extension(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.(gif|gifv|mp4|webm|mov|m4v|webp|jpg|jpeg|png)$/i);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function looksLikeMedia(url) {
  if (!isHttp(url)) return false;
  const h = host(url);
  const e = extension(url);
  if (e) return true;
  // Extension-less CDN/media hosts only. Do NOT treat normal site pages
  // such as giphy.com/gifs/... as downloadable media.
  return /^(?:media\d*\.)?giphy\.com$/i.test(h) && /^media\d*\./i.test(h) ||
    /^media\.tenor\.com$/i.test(h) ||
    /^(?:i\.)?makeagif\.com$/i.test(h) && /\/(?:media|gif|uploads?)\//i.test(url) ||
    /^i\.gifer\.com$/i.test(h) ||
    /^(?:static\d*\.)?klipy\.com$/i.test(h) && /\/(?:media|assets|uploads?)\//i.test(url) ||
    /^j\.gifs\.com$/i.test(h);
}

function allowedMedia(url) {
  if (!looksLikeMedia(url)) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (/\.(?:svg|ico|css|js|woff2?|ttf|eot)(?:[?#]|$)/i.test(u.pathname)) return false;
    if (/sprite|logo|avatar|favicon|icon\.|tracking|pixel/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function unique(list) {
  const out = [];
  const seen = new Set();
  for (const value of list || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function cacheGet(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function cacheSet(key, value) {
  cache.set(key, { time: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
}

async function fetchHtml(url, extra = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), extra.timeout || TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { ...BASE_HEADERS, ...(extra.headers || {}) },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), url: r.url, status: r.status };
  } finally {
    clearTimeout(timer);
  }
}

function extractAttrs(html, baseUrl) {
  const urls = [];
  const add = raw => {
    const u = abs(raw, baseUrl);
    if (u && allowedMedia(u)) urls.push(u);
  };

  // src/srcset/data-src/poster/content/href/style
  const attr = /(?:src|data-src|data-original|data-lazy-src|data-url|data-image|poster|content|href|data-href)\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(attr)) add(m[1]);

  // srcset contains comma-separated candidates.
  const srcset = /(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(srcset)) {
    for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }

  // CSS url(...)
  const css = /url\(\s*["']?([^"')\s]+)["']?\s*\)/gi;
  for (const m of html.matchAll(css)) add(m[1]);

  // Raw/JSON-escaped HTTP URLs.
  const raw = /https?:\\?\/\\?\/[^\s"'<>\\]+/gi;
  for (const m of html.matchAll(raw)) add(m[0]);

  return unique(urls);
}

function extractTitles(html) {
  const out = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && clean(decodeHtml(m[1]))) out.push(clean(decodeHtml(m[1])));
  }
  return out;
}

function extractPageLinks(html, baseUrl, sourceHost) {
  const links = [];
  const add = raw => {
    const u = abs(raw, baseUrl);
    if (!u) return;
    try {
      const h = new URL(u).hostname;
      if (h === sourceHost || h.endsWith('.' + sourceHost)) links.push(u);
    } catch {}
  };
  const re = /(?:href|data-href)\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) add(m[1]);
  return unique(links).slice(0, DETAIL_PAGES * 3);
}

function scoreMedia(url, source) {
  let score = 0;
  const e = extension(url);
  if (e === 'mp4') score += 80;
  if (e === 'gif') score += 70;
  if (e === 'webm') score += 65;
  if (e === 'webp') score += 35;
  if (e === 'jpg' || e === 'jpeg' || e === 'png') score += 20;
  if (/media\./i.test(host(url))) score += 15;
  if (new RegExp(source.mediaHost || 'a^', 'i').test(host(url))) score += 25;
  if (/original|source|full|download|media/i.test(url)) score += 8;
  if (/thumb|thumbnail|avatar|preview|small|tiny|_150\b|_100\b/i.test(url)) score -= 25;
  return score;
}

function makeResult(source, url, title, pageUrl) {
  const direct = abs(url, pageUrl || url);
  if (!direct || !allowedMedia(direct)) return null;
  return {
    source,
    url: direct,
    pageUrl: pageUrl || direct,
    title: clean(title) || `${source} GIF`,
  };
}

async function scrapeHtmlPage(sourceName, pageUrl, options = {}) {
  const cacheKey = `${sourceName}|${pageUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const source = SOURCES[sourceName];
  const page = await fetchHtml(pageUrl, {
    timeout: TIMEOUT_MS,
    headers: {
      Referer: source.referer || pageUrl,
      ...(options.headers || {}),
    },
  });

  const title = extractTitles(page.text)[0] || options.query || source.label;
  let direct = extractAttrs(page.text, page.url)
    .filter(source.filter || (() => true));
  direct.push(...extractMetaMedia(page.text, page.url).filter(source.filter || (() => true)));

  // A bounded number of detail pages handles galleries that expose only
  // page links in the initial HTML.
  if (direct.length < MAX_PER_SOURCE) {
    const links = extractPageLinks(page.text, page.url, host(page.url));
    for (const link of links) {
      if (direct.length >= MAX_PER_SOURCE * 2) break;
      try {
        const detail = await fetchHtml(link, {
          timeout: TIMEOUT_MS,
          headers: { Referer: page.url },
        });
        direct.push(...extractAttrs(detail.text, detail.url).filter(source.filter || (() => true)));
        // OG/social tags can be present with a different attribute shape.
        const metaMedia = extractMetaMedia(detail.text, detail.url);
        direct.push(...metaMedia.filter(source.filter || (() => true)));
      } catch (error) {
        // One detail page failing must not fail the source.
      }
    }
  }

  direct = unique(direct)
    .sort((a, b) => scoreMedia(b, source) - scoreMedia(a, source));

  const results = direct.slice(0, MAX_PER_SOURCE)
    .map(url => makeResult(sourceName, url, title, page.url))
    .filter(Boolean);

  cacheSet(cacheKey, results);
  return results;
}

function extractMetaMedia(html, pageUrl) {
  const out = [];
  const props = [
    'og:image', 'og:image:url', 'og:image:secure_url',
    'og:video', 'og:video:url', 'og:video:secure_url',
    'twitter:image', 'twitter:image:src', 'twitter:player:stream',
  ];
  for (const property of props) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i');
    const m = html.match(a) || html.match(b);
    if (m) {
      const u = abs(m[1], pageUrl);
      if (u && allowedMedia(u)) out.push(u);
    }
  }
  return unique(out);
}

async function browserScrape(sourceName, pageUrl, query) {
  if (SCROLL_ROUNDS <= 0) return [];
  if (!playwrightModule) {
    try {
      playwrightModule = require('playwright');
    } catch {
      playwrightModule = false;
    }
  }
  if (!playwrightModule) return [];

  let browser;
  try {
    browser = await playwrightModule.chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: UA,
      viewport: { width: 1365, height: 900 },
    });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(1200);

    const collected = new Set();
    for (let i = 0; i <= SCROLL_ROUNDS; i++) {
      const html = await page.content();
      for (const url of extractAttrs(html, page.url)) collected.add(url);
      if (collected.size >= MAX_PER_SOURCE * 2) break;
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }

    const source = SOURCES[sourceName];
    return [...collected]
      .filter(source.filter || (() => true))
      .sort((a, b) => scoreMedia(b, source) - scoreMedia(a, source))
      .slice(0, MAX_PER_SOURCE)
      .map(u => makeResult(sourceName, u, query, page.url))
      .filter(Boolean);
  } catch (error) {
    console.error(`[GIF-WEB] browser ${sourceName}: ${error.message}`);
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function sourcePage(sourceName, query) {
  const s = SOURCES[sourceName];
  return s.url(query);
}

function sourceFilter(hostPattern) {
  return url => {
    const h = host(url);
    return hostPattern.test(h) && !/\.(?:svg|ico|css|js|woff2?)$/i.test(url);
  };
}

const COMMON_GIF_MEDIA = /(?:\.(?:gif|gifv|mp4|webm|mov|m4v|webp)(?:[?#]|$)|\/media\/|\/images?\/|\/uploads?\/|\/download\/)/i;

const SOURCES = {
  giphy: {
    label: 'GIPHY',
    referer: 'https://giphy.com/',
    mediaHost: 'giphy',
    url: q => `https://giphy.com/search/${encodeURIComponent(slug(q))}`,
    filter: sourceFilter(/(?:^|\.)giphy\.com$/i),
  },
  tenor: {
    label: 'Tenor',
    referer: 'https://tenor.com/',
    mediaHost: 'tenor',
    url: q => `https://tenor.com/search/${encodeURIComponent(slug(q))}-gifs`,
    filter: sourceFilter(/(?:^|\.)tenor\.com$/i),
  },
  gifer: {
    label: 'GIFER',
    referer: 'https://gifer.com/',
    mediaHost: 'gifer',
    url: q => `https://gifer.com/en/gifs/${encodeURIComponent(slug(q))}`,
    filter: sourceFilter(/(?:^|\.)gifer\.com$/i),
  },
  gifdb: {
    label: 'GIFDB',
    referer: 'https://gifdb.com/',
    mediaHost: 'gifdb',
    url: q => `https://gifdb.com/search/${encodeURIComponent(slug(q))}`,
    filter: sourceFilter(/(?:^|\.)gifdb\.com$/i),
  },
  gifbin: {
    label: 'GIFBin',
    referer: 'https://gifbin.com/',
    mediaHost: 'gifbin',
    url: q => `https://gifbin.com/tag/${encodeURIComponent(slug(q))}/`,
    filter: sourceFilter(/(?:^|\.)gifbin\.com$/i),
  },
  gifimage: {
    label: 'GIFImage.net',
    referer: 'https://www.gifimage.net/',
    mediaHost: 'gifimage',
    url: q => `https://www.gifimage.net/?s=${encodeURIComponent(q)}`,
    filter: sourceFilter(/(?:^|\.)gifimage\.net$/i),
  },
  reactiongifs: {
    label: 'Reaction GIFs',
    referer: 'https://www.reactiongifs.com/',
    mediaHost: 'reactiongifs',
    url: q => `https://www.reactiongifs.com/tag/${encodeURIComponent(slug(q))}/`,
    filter: sourceFilter(/(?:^|\.)reactiongifs\.com$/i),
  },
  animatedimages: {
    label: 'AnimatedImages.org',
    referer: 'https://www.animatedimages.org/',
    mediaHost: 'animatedimages',
    url: q => `https://www.animatedimages.org/search?q=${encodeURIComponent(q)}`,
    filter: sourceFilter(/(?:^|\.)animatedimages\.org$/i),
  },
  imgflip: {
    label: 'Imgflip',
    referer: 'https://imgflip.com/',
    mediaHost: 'imgflip',
    url: q => `https://imgflip.com/search?q=${encodeURIComponent(q)}`,
    filter: url => /(?:^|\.)imgflip\.com$/i.test(host(url)) && COMMON_GIF_MEDIA.test(url),
  },
  klipy: {
    label: 'KLIPY',
    referer: 'https://klipy.com/',
    mediaHost: 'klipy',
    url: q => `https://klipy.com/search?q=${encodeURIComponent(q)}`,
    filter: sourceFilter(/(?:^|\.)klipy\.com$/i),
  },
  makeagif: {
    label: 'MakeaGIF',
    referer: 'https://makeagif.com/',
    mediaHost: 'makeagif',
    url: q => `https://makeagif.com/${encodeURIComponent(slug(q))}-gifs`,
    filter: sourceFilter(/(?:^|\.)makeagif\.com$/i),
  },
  imgur: {
    label: 'Imgur',
    referer: 'https://imgur.com/',
    mediaHost: 'imgur',
    url: q => `https://imgur.com/search?q=${encodeURIComponent(q + ' ext:gif')}`,
    filter: url => /(?:^|\.)imgur\.com$/i.test(host(url)) && /(?:gif|gifv|mp4|webm|animated|media|i\.imgur)/i.test(url),
  },
  reddit: {
    label: 'Reddit',
    referer: 'https://www.reddit.com/',
    mediaHost: 'reddit',
    url: q => `https://www.reddit.com/search/?q=${encodeURIComponent(q + ' gif')}&type=link&sort=relevance`,
    filter: url => /(?:redditmedia|redd\.it|reddit\.com|giphy|tenor|imgur)/i.test(url) && /(?:gif|gifv|mp4|webm|media|preview|i\.imgur)/i.test(url),
  },
  tumblr: {
    label: 'Tumblr',
    referer: 'https://www.tumblr.com/',
    mediaHost: 'tumblr',
    url: q => `https://www.tumblr.com/tagged/${encodeURIComponent(q + ' gif')}`,
    filter: url => /(?:media\.tumblr\.com|tumblr\.com)/i.test(url),
  },
  pinterest: {
    label: 'Pinterest',
    referer: 'https://www.pinterest.com/',
    mediaHost: 'pinimg',
    url: q => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q + ' gif')}`,
    filter: url => /(?:pinimg\.com|pinterest\.com)/i.test(url) && /(?:jpg|jpeg|png|webp|gif|mp4|webm|video|pinimg)/i.test(url),
  },
  gifscom: {
    label: 'Gifs.com',
    referer: 'https://gifs.com/',
    mediaHost: 'gifs.com',
    url: q => `https://gifs.com/search?q=${encodeURIComponent(q)}`,
    alternates: q => [
      `https://gifs.com/search?q=${encodeURIComponent(q)}`,
      `https://gifs.com/explore/${encodeURIComponent(slug(q))}`,
      `https://gifs.com/tag/${encodeURIComponent(slug(q))}`,
    ],
    filter: sourceFilter(/(?:^|\.)gifs\.com$/i),
  },
  thechive: {
    label: 'theCHIVE GIFs',
    referer: 'https://thechive.com/',
    mediaHost: 'thechive',
    url: q => `https://thechive.com/tag/${encodeURIComponent(slug(q))}/`,
    alternates: q => [
      `https://thechive.com/tag/${encodeURIComponent(slug(q))}/`,
      'https://thechive.com/tag/gif/',
      'https://thechive.com/category/humor/gifs/t/galleries/',
    ],
    filter: url => /(?:thechive\.com|chivemedia\.com|thechive\.com\/wp-content)/i.test(url) && COMMON_GIF_MEDIA.test(url),
  },
  '9gag': {
    label: '9GAG',
    referer: 'https://9gag.com/',
    mediaHost: '9gag',
    url: q => `https://9gag.com/tag/${encodeURIComponent(slug(q))}`,
    filter: url => /(?:9gag\.com|img-9gag-fun\.9cache\.com|9cache\.com)/i.test(url) && /(?:gif|mp4|webm|video|image)/i.test(url),
  },
};

async function searchSource(name, query) {
  const s = SOURCES[name];
  if (!s) return [];

  const pages = s.alternates ? s.alternates(query) : [s.url(query)];
  const all = [];

  for (const page of pages) {
    try {
      const got = await scrapeHtmlPage(name, page, { query });
      all.push(...got);
      if (all.length >= MAX_PER_SOURCE) break;
    } catch (error) {
      console.error(`[GIF-WEB] ${name}: ${error.message}`);
    }
    if (all.length < MAX_PER_SOURCE && SCROLL_ROUNDS > 0) {
      const browser = await browserScrape(name, page, query);
      all.push(...browser);
      if (all.length >= MAX_PER_SOURCE) break;
    }
  }

  const seen = new Set();
  return all.filter(item => {
    if (!item || !item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, MAX_PER_SOURCE);
}

async function mapLimit(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { out[i] = await worker(items[i], i); }
      catch (error) { out[i] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, runner));
  return out;
}

async function searchAll(query) {
  const names = Object.keys(SOURCES);
  const rows = await mapLimit(names, SOURCE_CONCURRENCY, async name => ({
    name,
    results: await searchSource(name, query),
  }));
  const merged = [];
  for (const row of rows) if (row?.results?.length) merged.push(...row.results);
  // Interleave providers so one site does not dominate the first result(s).
  const buckets = new Map();
  for (const item of merged) {
    if (!buckets.has(item.source)) buckets.set(item.source, []);
    buckets.get(item.source).push(item);
  }
  const out = [];
  while (out.length < Math.max(MAX_RESULTS * 2, 8)) {
    let added = false;
    for (const bucket of buckets.values()) {
      const item = bucket.shift();
      if (item) {
        out.push(item);
        added = true;
        if (out.length >= Math.max(MAX_RESULTS * 2, 8)) break;
      }
    }
    if (!added) break;
  }
  return out;
}

function parseCountAndQuery(tokens) {
  const list = Array.isArray(tokens) ? tokens.map(clean).filter(Boolean) : [];
  let count = 1;
  if (/^\d+$/.test(list[0] || '')) count = Math.min(MAX_RESULTS, Math.max(1, Number.parseInt(list.shift(), 10)));
  return { count, query: clean(list.join(' ')) };
}

function commandText(message) {
  const m = message?.message || {};
  return m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    '';
}

function detectCommand(raw) {
  const parts = clean(raw).split(/\s+/).filter(Boolean);
  const command = String(parts.shift() || '').replace(/^[!./#$-]+/, '').toLowerCase();
  return { command, args: parts };
}

function guessMime(url, responseType) {
  const type = String(responseType || '').split(';')[0].toLowerCase();
  if (type) return type;
  const e = extension(url);
  return ({
    gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
  })[e] || 'application/octet-stream';
}

async function downloadMedia(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(TIMEOUT_MS, 20000));
  let filePath = null;
  let file = null;
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        ...BASE_HEADERS,
        Accept: 'image/gif,image/webp,image/jpeg,image/png,video/mp4,video/webm,video/*;q=0.9,*/*;q=0.05',
      },
    });
    if (!r.ok) throw new Error(`media HTTP ${r.status}`);

    const mime = guessMime(r.url || url, r.headers.get('content-type'));
    if (!/^image\/(?:gif|webp|jpeg|png)|^video\//i.test(mime)) {
      throw new Error(`not a media response (${mime})`);
    }

    const length = Number(r.headers.get('content-length') || 0);
    if (length && length > MAX_BYTES) throw new Error('media exceeds configured size limit');

    fs.mkdirSync(TMP_DIR, { recursive: true });
    const ext = extFromMime(mime, r.url || url);
    filePath = path.join(TMP_DIR, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    file = fs.createWriteStream(filePath, { flags: 'wx' });

    let total = 0;
    if (!r.body) throw new Error('empty response body');
    for await (const chunk of r.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new Error('media exceeds configured size limit');
      if (!file.write(chunk)) await new Promise((resolve, reject) => {
        file.once('drain', resolve);
        file.once('error', reject);
      });
    }
    await new Promise((resolve, reject) => {
      file.end(resolve);
      file.once('error', reject);
    });
    file = null;
    return { path: filePath, mime, finalUrl: r.url || url };
  } catch (error) {
    if (file) file.destroy();
    if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extFromMime(mime, url) {
  const map = {
    'image/gif': '.gif', 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  };
  if (map[mime]) return map[mime];
  return extension(url) ? '.' + extension(url) : '.bin';
}

function hasCommand(name) {
  return new Promise(resolve => {
    const p = spawn(name, ['-version'], { stdio: 'ignore' });
    p.once('error', () => resolve(false));
    p.once('close', code => resolve(code === 0));
  });
}

function toMp4(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', input,
      '-vf', 'fps=15,scale=640:640:force_original_aspect_ratio=decrease:flags=lanczos,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=black@0',
      '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-preset', 'veryfast', '-crf', '29', '-t', '12', output,
    ];
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.once('error', reject);
    p.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function prepare(item) {
  const original = await downloadMedia(item.url);
  let finalPath = original.path;
  const cleanup = [original.path];
  const e = extension(original.finalUrl) || extension(item.url);
  if (await hasCommand('ffmpeg') && ['gif', 'webm', 'webp'].includes(e)) {
    const mp4 = original.path + '.mp4';
    try {
      await toMp4(original.path, mp4);
      finalPath = mp4;
      cleanup.push(mp4);
    } catch {
      try { fs.unlinkSync(mp4); } catch {}
    }
  }
  return { ...original, path: finalPath, cleanup };
}

async function sendItem(sock, jid, message, item) {
  const prepared = await prepare(item);
  try {
    const data = fs.readFileSync(prepared.path);
    const e = extension(prepared.path);
    if (e === 'mp4' || e === 'webm' || e === 'mov') {
      return sock.sendMessage(jid, {
        video: data,
        mimetype: e === 'webm' ? 'video/webm' : 'video/mp4',
        gifPlayback: true,
        caption: `🎞️ ${item.source.toUpperCase()}`,
      }, { quoted: message });
    }
    if (e === 'gif' || e === 'webp') {
      // Only reached when ffmpeg is unavailable. Send as an image/document
      // rather than falsely claiming a native WhatsApp looping GIF.
      return sock.sendMessage(jid, {
        document: data,
        mimetype: prepared.mime || (e === 'gif' ? 'image/gif' : 'image/webp'),
        fileName: `${slug(item.title).slice(0, 45) || 'gif'}.${e}`,
        caption: `🎞️ ${item.source.toUpperCase()}`,
      }, { quoted: message });
    }
    return sock.sendMessage(jid, {
      image: data,
      mimetype: prepared.mime || 'image/jpeg',
      caption: `🎞️ ${item.source.toUpperCase()}`,
    }, { quoted: message });
  } finally {
    for (const file of prepared.cleanup || []) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

function sourceStatus() {
  return Object.entries(SOURCES).map(([name, source]) => `✅ ${name} — ${source.label}`).join('\n');
}

function usage(prefix) {
  return [
    '🎞️ *ABIX GIF WEB SCRAPER*',
    '',
    `• ${prefix}gifscrape <query>`,
    `• ${prefix}gifscrape <n> <query>`,
    `• ${prefix}gifweb <site> <query>`,
    `• ${prefix}gifrandom [query]`,
    `• ${prefix}gifsites`,
    `• ${prefix}giftest <site> <query>`,
    '',
    `Example: ${prefix}gifscrape funny`,
    `Example: ${prefix}gifweb tenor angry`,
  ].join('\n');
}

async function run({ sock, message, args = [], context = {} }) {
  const jid = context.chatId || context.from || message?.key?.remoteJid;
  if (!jid) return;

  const raw = commandText(message);
  const parsed = detectCommand(raw);
  const command = parsed.command;

  // Dispatcher may already strip the command and pass args.
  const effectiveArgs = parsed.args.length ? parsed.args : args;
  const reply = text => sock.sendMessage(jid, { text }, { quoted: message });

  if (!['gifscrape', 'gifall', 'gifweb', 'gifrandom', 'gifsites', 'giftest'].includes(command)) return;

  if (command === 'gifsites') {
    return reply(`╭─〔 🎞️ NO-API GIF SOURCES 〕─╮\n${sourceStatus()}\n╰──────────────────────────────╯`);
  }

  if (busy.has(jid)) return reply('⏳ A GIF web-scrape is already running in this chat.');
  const last = lastRun.get(jid) || 0;
  if (Date.now() - last < COOLDOWN_MS) return reply('⏱️ Please wait a few seconds before another GIF search.');

  if (command === 'giftest') {
    const site = clean(effectiveArgs[0]).toLowerCase();
    const query = clean(effectiveArgs.slice(1).join(' '));
    if (!site || !query || !SOURCES[site]) return reply(`⚠️ Usage: -giftest <site> <query>\n\nSites: ${Object.keys(SOURCES).join(', ')}`);
    busy.add(jid);
    lastRun.set(jid, Date.now());
    try {
      const page = sourcePage(site, query);
      const results = await searchSource(site, query);
      const browserAvailable = (() => {
        if (playwrightModule === false) return false;
        try { require.resolve('playwright'); return true; } catch { return false; }
      })();
      return reply([
        `🧪 *GIF SOURCE TEST — ${SOURCES[site].label}*`,
        '',
        `Query: ${query}`,
        `Search page: ${page}`,
        `Direct media found: ${results.length}`,
        `Browser fallback installed: ${browserAvailable ? 'YES' : 'NO'}`,
        results[0]?.url ? `First media: ${results[0].url}` : 'First media: none',
      ].join('\n'));
    } catch (error) {
      return reply(`❌ ${SOURCES[site].label} test failed: ${clean(error.message)}`);
    } finally {
      busy.delete(jid);
    }
  }

  let query;
  let count = 1;
  if (command === 'gifweb') {
    const site = clean(effectiveArgs[0]).toLowerCase();
    if (!site || !SOURCES[site]) return reply(`❌ Unknown site. Use *-gifsites*.\n\nAvailable: ${Object.keys(SOURCES).join(', ')}`);
    const parsedQuery = parseCountAndQuery(effectiveArgs.slice(1));
    count = parsedQuery.count;
    query = parsedQuery.query;
    if (!query) return reply('⚠️ Usage: -gifweb <site> <query>');
  } else {
    const parsedQuery = parseCountAndQuery(effectiveArgs);
    count = parsedQuery.count;
    query = parsedQuery.query || 'funny reaction';
  }

  busy.add(jid);
  lastRun.set(jid, Date.now());
  try {
    await sock.sendMessage(jid, { react: { text: '⏳', key: message.key } }).catch(() => {});

    let results;
    if (command === 'gifweb') {
      results = await searchSource(clean(effectiveArgs[0]).toLowerCase(), query);
    } else {
      results = await searchAll(query);
    }

    if (!results.length) {
      return reply(`❌ No direct GIF/media found for *${query}*.\n\nTry: *-gifweb tenor ${query}* or *-giftest giphy ${query}*`);
    }

    if (command === 'gifrandom') {
      results = [results[Math.floor(Math.random() * results.length)]];
    } else {
      results = results.slice(0, count);
    }

    let sent = 0;
    for (const item of results) {
      try {
        await sendItem(sock, jid, message, item);
        sent++;
      } catch (error) {
        console.error(`[GIF-WEB] send ${item.source}: ${error.message}`);
      }
      if (results.length > 1) await sleep(SEND_DELAY_MS);
    }

    await sock.sendMessage(jid, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
    if (!sent) return reply('❌ Sources returned results, but none could be downloaded as media. Run *-giftest <site> <query>* to diagnose a source.');
    if (sent < results.length) return reply(`ℹ️ Sent ${sent}/${results.length}. Some media URLs were unavailable or exceeded the limit.`);
  } catch (error) {
    console.error('[GIF-WEB]', error);
    return reply(`❌ GIF scrape failed: ${clean(error.message).slice(0, 180)}`);
  } finally {
    busy.delete(jid);
  }
}

// Clean only our own temp directory at module startup.
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}

module.exports = {
  command: 'gifscrape',
  aliases: ['gifall', 'gifweb', 'gifrandom', 'gifsites', 'giftest'],
  category: 'media',
  permission: 'PUBLIC/DEFAULT',
  description: 'Scrape public GIF/media pages without API keys and send results to WhatsApp.',
  usage: '-gifscrape <query> | -gifweb <site> <query>',
  async handler(sock, message, args = [], context = {}) {
    return run({ sock, message, args, context });
  },
  async execute({ sock, msg, from, args = [], ...context }) {
    return run({ sock, message: msg, args, context: { ...context, chatId: from } });
  },
  async run({ sock, m, args = [], text = '', context = {} }) {
    return run({ sock, message: m, args, context });
  },
  sources: SOURCES,
};
