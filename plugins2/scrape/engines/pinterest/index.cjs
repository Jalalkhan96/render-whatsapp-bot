'use strict';

// Public-page Pinterest media extractor. Browser/XHR harvesting is optional;
// the scraper remains lightweight and can run without Playwright installed.
const DEFAULT_TIMEOUT = 25000;
const SEARCH_BASE = 'https://www.pinterest.com/search/pins/?q=';
const ALLOWED_HOSTS = new Set(['pinterest.com', 'www.pinterest.com', 'pin.it', 'www.pin.it']);
const MEDIA_HOST_RE = /(^|\.)pinimg\.com$/i;
const VIDEO_EXT_RE = /\.(?:mp4|webm|mov|m4v|m3u8)(?:$|[?#])/i;
const MAX_LIMIT = 30;
let browserScrapeInProgress = false;

function decodeEscaped(value) {
  return String(value || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003F/gi, '?')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function safeUrl(raw) {
  const text = decodeEscaped(raw).replace(/[\\"'<>),]+$/g, '');
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch { return null; }
}

function validPinterestPage(raw) {
  const url = safeUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host) && !MEDIA_HOST_RE.test(host)) return null;
  return url;
}

function normalizeMedia(raw) {
  const url = safeUrl(raw);
  if (!url || !MEDIA_HOST_RE.test(url.hostname)) return null;
  return url.toString();
}

function mediaType(url, hint = '') {
  if (/video|video_list|video_url|videoUrl|mp4|stream/i.test(String(hint || ''))) return 'video';
  const clean = String(url || '').split('#')[0];
  if (VIDEO_EXT_RE.test(clean) || /\/videos?\//i.test(clean)) return 'video';
  return 'image';
}

function descriptionOf(obj) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of ['grid_title', 'title', 'description', 'alt_text', 'alt', 'name']) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\s+/g, ' ').slice(0, 500);
  }
  return '';
}

function dedup(items, limit = MAX_LIMIT) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    if (!raw?.url) continue;
    const url = normalizeMedia(raw.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...raw, url, type: raw.type === 'video' ? 'video' : mediaType(url, raw.hint) });
    if (out.length >= limit) break;
  }
  return out;
}

function harvestJson(obj, mediaItems, seen, inheritedDescription = '', keyPath = '') {
  if (Array.isArray(obj)) {
    for (const item of obj) harvestJson(item, mediaItems, seen, inheritedDescription, keyPath);
    return;
  }
  if (!obj || typeof obj !== 'object') return;

  const description = descriptionOf(obj) || inheritedDescription;
  const images = obj.images;
  if (images && typeof images === 'object' && !Array.isArray(images)) {
    for (const key of ['orig', 'original', 'originals', '1200x', '736x', '474x', '236x']) {
      const entry = images[key];
      const url = typeof entry === 'string' ? entry : entry?.url;
      const normalized = normalizeMedia(url);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        mediaItems.push({ type: 'image', url: normalized, description, source: 'xhr_api_json' });
        break;
      }
    }
  }

  const videos = obj.videos;
  if (videos && typeof videos === 'object') {
    const list = videos.video_list;
    if (list && typeof list === 'object') {
      for (const [resolution, entry] of Object.entries(list)) {
        const url = typeof entry === 'string' ? entry : entry?.url;
        const normalized = normalizeMedia(url);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          mediaItems.push({
            type: 'video', url: normalized, resolution,
            width: entry?.width, height: entry?.height,
            duration_ms: entry?.duration || videos.duration,
            thumbnail: normalizeMedia(entry?.thumbnail) || undefined,
            description, source: 'xhr_api_json',
          });
        }
      }
    }
  }

  // Pinterest responses sometimes expose media without the standard `images`
  // or `videos` shape. Only accept a direct pinimg URL found in a media-like key.
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && /url|src|stream|video|image/i.test(key)) {
      const normalized = normalizeMedia(value);
      const type = mediaType(normalized, `${keyPath}.${key}`);
      if (normalized && !seen.has(normalized) && (type === 'video' || /image|img|thumbnail|src/i.test(key))) {
        seen.add(normalized);
        mediaItems.push({ type, url: normalized, description, source: 'xhr_api_json' });
      }
    } else if (value && typeof value === 'object') {
      harvestJson(value, mediaItems, seen, description, `${keyPath}.${key}`);
    }
  }
}

function extractMediaFromHtml(html, limit = MAX_LIMIT) {
  const source = decodeEscaped(String(html || ''));
  const items = [];
  const seen = new Set();

  // Harvest common structured JSON blocks first, including __PWS_DATA__ script
  // tags (read the script contents, not window.__PWS_DATA__ named DOM access).
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = String(match[1] || '').trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) continue;
    try { harvestJson(JSON.parse(text), items, seen); } catch { /* not a JSON script */ }
  }

  // Direct and JSON-escaped CDN URLs.
  const expressions = [
    /https?:\\?\/\\?\/[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]*?pinimg\.com[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]*/gi,
    /https?:\\u002F\\u002F[^"'\s<>]+pinimg\.com[^"'\s<>]*/gi,
  ];
  for (const re of expressions) {
    for (const match of source.matchAll(re)) {
      const url = normalizeMedia(match[0]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({ type: mediaType(url), url, description: '', source: 'html_regex' });
    }
  }

  // OpenGraph and Twitter card fallbacks.
  for (const match of source.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:(?:image|video)(?::url|:secure_url)?|twitter:(?:image|image:src|player:stream))["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
    const url = normalizeMedia(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({ type: mediaType(url, match[0]), url, source: 'html_meta' });
  }

  return dedup(items, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || MAX_LIMIT)));
}

async function fetchHtml(url, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`Pinterest HTTP ${res.status}`);
    return { html: await res.text(), url: res.url || url };
  } finally { clearTimeout(timer); }
}

function getBrowser() {
  try {
    const playwrightExtra = require('playwright-extra');
    try {
      const stealth = require('puppeteer-extra-plugin-stealth');
      if (typeof playwrightExtra.chromium?.use === 'function') playwrightExtra.chromium.use(stealth());
    } catch { /* stealth plug-in is optional */ }
    return playwrightExtra.chromium;
  } catch {
    try { return require('playwright').chromium; } catch { return null; }
  }
}

async function browserScrape(url, options = {}) {
  const chromium = getBrowser();
  if (!chromium || browserScrapeInProgress) return [];
  // A single shared Chromium launch at a time protects small bot hosts from RAM spikes.
  browserScrapeInProgress = true;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(options.limit) || 8));
  const scrolls = Math.max(0, Math.min(6, Number.isFinite(Number(options.scrolls)) ? Number(options.scrolls) : 3));
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT);
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1280, height: 820 },
    });
    const page = await context.newPage();
    const capturedPayloads = [];
    page.on('response', (response) => {
      if (!/\/resource\//i.test(response.url())) return;
      try {
        const host = new URL(response.url()).hostname.toLowerCase();
        if (host !== 'pinterest.com' && !host.endsWith('.pinterest.com')) return;
        capturedPayloads.push(response.json().catch(() => null));
      } catch { /* ignore malformed response URLs */ }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(1400);
    const out = [];
    const seen = new Set();
    const initial = await page.content().catch(() => '');
    for (const item of extractMediaFromHtml(initial, limit)) {
      if (!seen.has(item.url)) { seen.add(item.url); out.push({ ...item, source: 'browser_html' }); }
    }

    for (let i = 0; i < scrolls && out.length < limit; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(850);
    }

    const payloads = await Promise.allSettled(capturedPayloads);
    for (const payload of payloads) {
      if (payload.status !== 'fulfilled' || !payload.value) continue;
      const harvested = [];
      harvestJson(payload.value, harvested, new Set());
      for (const item of harvested) {
        if (!seen.has(item.url)) { seen.add(item.url); out.push({ ...item, source: 'xhr_api_json' }); }
      }
    }

    const domItems = await page.evaluate(() => {
      const result = [];
      const add = (raw, type, description = '') => {
        if (!raw) return;
        try {
          const u = new URL(raw, location.href);
          if (!/pinimg\.com$/i.test(u.hostname)) return;
          const clean = u.toString();
          const isVideo = type === 'video' || /\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])/i.test(clean) || /\/videos?\//i.test(clean);
          result.push({ url: clean, type: isVideo ? 'video' : 'image', description, source: 'browser_dom' });
        } catch { /* skip invalid URL */ }
      };
      document.querySelectorAll('img').forEach((img) => {
        add(img.currentSrc || img.src || img.getAttribute('data-src'), 'image', img.alt || '');
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
        for (const entry of srcset.split(',')) add(entry.trim().split(/\s+/)[0], 'image', img.alt || '');
      });
      document.querySelectorAll('video').forEach((video) => {
        add(video.currentSrc || video.src || video.getAttribute('data-src'), 'video');
        if (video.poster) add(video.poster, 'image');
        video.querySelectorAll('source').forEach((source) => add(source.src || source.getAttribute('src'), 'video'));
      });
      document.querySelectorAll('meta[property="og:image"],meta[property="og:video"],meta[name="twitter:image"],meta[name="twitter:player:stream"]').forEach((meta) => {
        add(meta.content, /video|stream/i.test(meta.getAttribute('property') || meta.name || '') ? 'video' : 'image');
      });
      return result;
    }).catch(() => []);

    for (const item of domItems) {
      const normalized = normalizeMedia(item.url);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push({ ...item, url: normalized });
    }
    return dedup(out, limit);
  } finally {
    await browser?.close().catch(() => {});
    browserScrapeInProgress = false;
  }
}

async function resolveRedirect(url, timeoutMs) {
  const parsed = validPinterestPage(url);
  if (!parsed) throw new Error('Not a supported public Pinterest URL');
  if (MEDIA_HOST_RE.test(parsed.hostname)) return parsed.toString();
  try {
    const response = await fetch(parsed.toString(), {
      method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154 Safari/537.36' },
    });
    const finalUrl = new URL(response.url || parsed.toString());
    if (ALLOWED_HOSTS.has(finalUrl.hostname.toLowerCase()) || MEDIA_HOST_RE.test(finalUrl.hostname)) return finalUrl.toString();
  } catch { /* GET and browser fallback may still succeed */ }
  return parsed.toString();
}

function safeName(value) {
  return String(value || 'pinterest').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 80) || 'pinterest';
}

async function scrape(input, options = {}) {
  const timeoutMs = Math.max(5000, Math.min(60000, Number(options.timeoutMs) || DEFAULT_TIMEOUT));
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(options.limit) || 8));
  const scrolls = Math.max(0, Math.min(6, Number(options.scrolls ?? 3)));
  const value = String(input || '').trim();
  if (!value) throw new Error('Pinterest query/URL is empty');
  const desiredMode = String(options.mediaType || options.type || 'all').toLowerCase();
  // Video-only searches need a wider candidate pool so leading image URLs do not
  // crowd videos out before the type filter is applied.
  const candidateLimit = ['image', 'video'].includes(desiredMode) ? MAX_LIMIT : Math.min(MAX_LIMIT, limit * 2);

  const target = /^https?:\/\//i.test(value)
    ? await resolveRedirect(value, timeoutMs)
    : `${SEARCH_BASE}${encodeURIComponent(value)}`;
  let items = [];
  let directError = '';
  try {
    const page = await fetchHtml(target, timeoutMs);
    items = extractMediaFromHtml(page.html, candidateLimit);
  } catch (error) { directError = error?.message || String(error); }

  const matchingCount = () => !['image', 'video'].includes(desiredMode)
    ? items.length : items.filter((item) => item.type === desiredMode).length;
  if (items.length < candidateLimit && matchingCount() < limit) {
    try {
      const browserItems = await browserScrape(target, { limit: candidateLimit, scrolls, timeoutMs });
      items = dedup([...items, ...browserItems], candidateLimit);
    } catch (error) {
      if (!directError) directError = error?.message || String(error);
    }
  }

  if (['image', 'video'].includes(desiredMode)) items = items.filter((item) => item.type === desiredMode);
  items = dedup(items, limit);
  if (!items.length) {
    const detail = directError ? ` (${directError})` : '';
    throw new Error(`Pinterest returned no public media. The page may be JavaScript-gated or rate-limited${detail}.`);
  }
  return items.map((item, index) => ({
    id: `pinterest:${index + 1}:${Buffer.from(item.url).toString('base64url').slice(0, 18)}`,
    platform: 'pinterest',
    type: item.type,
    url: item.url,
    title: item.description || '',
    description: item.description || '',
    resolution: item.resolution,
    thumbnail: item.thumbnail,
    source: item.source || 'direct_public_scrape',
    searchQuery: value,
  }));
}

async function extractPageTitle(url, timeoutMs = DEFAULT_TIMEOUT) {
  try {
    const page = await fetchHtml(url, timeoutMs);
    const html = page.html;
    const metas = [
      html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i),
      html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i),
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i),
    ];
    for (const found of metas) {
      const title = decodeEscaped(found?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (title && !/pinterest\s*$/i.test(title)) return title;
    }
  } catch { /* title is optional */ }
  return '';
}

async function searchSimilar(input, options = {}) {
  const maxPins = Math.max(1, Math.min(MAX_LIMIT, Number(options.maxPins || options.limit) || 8));
  const scrolls = Math.max(0, Math.min(5, Number(options.scrolls ?? 2)));
  let base = String(input || '').trim();
  if (!base) throw new Error('A Pinterest query or public Pin URL is required');

  if (/^https?:\/\//i.test(base)) {
    const valid = validPinterestPage(base);
    if (!valid || !ALLOWED_HOSTS.has(valid.hostname.toLowerCase())) throw new Error('Provide a public Pinterest Pin URL or a text query');
    const title = await extractPageTitle(base, Number(options.timeoutMs) || DEFAULT_TIMEOUT);
    const pinMatch = valid.pathname.match(/\/pin\/(\d+)/i);
    base = title || (pinMatch ? `Pinterest pin ${pinMatch[1]}` : 'Pinterest inspiration');
  }

  const variations = Array.isArray(options.variations) && options.variations.length
    ? options.variations.map(String).map((s) => s.trim()).filter(Boolean)
    : [`${base} similar`, `${base} ideas`, `${base} inspiration`, `${base} aesthetic`, base];

  const merged = [];
  const seen = new Set();
  const errors = [];
  for (const phrase of variations.slice(0, 5)) {
    if (merged.length >= maxPins) break;
    try {
      const found = await scrape(phrase, {
        limit: Math.min(maxPins - merged.length, 10), scrolls,
        timeoutMs: options.timeoutMs, mediaType: options.mediaType || 'all',
      });
      for (const item of found) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        merged.push({ ...item, searchQuery: phrase });
        if (merged.length >= maxPins) break;
      }
    } catch (error) { errors.push(error?.message || String(error)); }
  }
  if (!merged.length) throw new Error(`Pinterest similar search returned no public media${errors.length ? `: ${errors[0]}` : ''}`);
  return merged.slice(0, maxPins);
}

module.exports = {
  scrape,
  searchSimilar,
  extractPageTitle,
  extractMediaFromHtml,
  normalizeMedia,
  validPinterestPage,
  mediaType,
  harvestJson,
};
