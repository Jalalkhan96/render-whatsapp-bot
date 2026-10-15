import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const GOOGLE_URL = 'https://www.google.com/search';
const DEFAULT_MAX_RESULTS = 20;
const RESULTS_PER_PAGE = 5;
const PENDING_TTL = 20 * 60 * 1000;
const REQUEST_TIMEOUT = 20_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_FILE = path.join(ROOT_DIR, 'data', 'google-image-search.json');

const pendingImages = new Map();
let settingsCache = null;

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function clip(value, max = 100) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function isPrivateIp(ip) {
  const value = String(ip || '').toLowerCase();
  return (
    value === '::1' ||
    value === 'localhost' ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value) ||
    value.startsWith('169.254.') ||
    value.startsWith('100.64.') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(value) ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:')
  );
}

async function validatePublicUrl(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported image URL');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private image URL rejected');
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Private image URL rejected');
  }
  return url.toString();
}

function extractJsonAfterMarker(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return null;

  const objectStart = text.indexOf('{', start);
  if (objectStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = objectStart; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(objectStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function unescapeGoogleUrl(value) {
  return String(value || '')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003f/g, '?')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function parseIschj(text) {
  const source = String(text || '');
  const marker = source.indexOf('{"ischj":');
  if (marker === -1) return null;

  try {
    return JSON.parse(source.slice(marker));
  } catch {}

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = marker; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(marker, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function parseFallbackImageUrls(text) {
  const source = String(text || '');
  const results = [];
  const seen = new Set();
  const patterns = [
    /(?:"ou"|"imgurl"|"original_image_url"|"image_url")\s*:\s*"(https?:\/\/[^"\\]+)"/gi,
    /https?:\/\/[^"'<>\s]+\.(?:jpe?g|png|webp|gif)(?:\?[^"'<>\s]*)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[1] || match[0];
      const imageUrl = unescapeGoogleUrl(raw);
      if (!/^https?:\/\//i.test(imageUrl) || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      results.push({
        imageUrl,
        url: imageUrl,
        image: imageUrl,
        thumbnail: imageUrl,
        thumbnailUrl: imageUrl,
        title: 'Google Image',
        sourceUrl: null,
        width: null,
        height: null,
      });
      if (results.length >= DEFAULT_MAX_RESULTS) return results;
    }
  }
  return results;
}

export function extractGoogleImages(text) {
  const source = String(text || '');
  const data = parseIschj(source);
  const metadata = data?.ischj?.metadata;
  if (Array.isArray(metadata) && metadata.length) {
    const results = [];
    for (const item of metadata) {
      const original = item?.original_image;
      const thumbnail = item?.thumbnail;
      const result = item?.result;
      const imageUrl = unescapeGoogleUrl(original?.url);
      if (!/^https?:\/\//i.test(imageUrl)) continue;
      results.push({
        imageUrl,
        url: imageUrl,
        image: imageUrl,
        thumbnail: unescapeGoogleUrl(thumbnail?.url) || imageUrl,
        thumbnailUrl: /^https?:\/\//i.test(unescapeGoogleUrl(thumbnail?.url)) ? unescapeGoogleUrl(thumbnail?.url) : imageUrl,
        title: clip(result?.page_title || result?.title || 'Google Image', 160),
        sourceUrl: /^https?:\/\//i.test(String(result?.referrer_url || result?.url || '')) ? String(result?.referrer_url || result?.url) : null,
        width: Number(original?.width) || null,
        height: Number(original?.height) || null,
      });
    }
    if (results.length) return dedupe(results);
  }
  return dedupe(parseFallbackImageUrls(source));
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((item) => {
    const key = String(item?.imageUrl || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function googlePage(query, page = 0, safeSearch = true) {
  const params = new URLSearchParams({
    q: query,
    tbm: 'isch',
    hl: 'en',
    gl: 'us',
    ie: 'utf8',
    oe: 'utf8',
    asearch: 'isch',
    safe: safeSearch ? 'active' : 'off',
    async: `_fmt:json,p:1,ijn:${page}`,
  });

  const response = await fetch(`${GOOGLE_URL}?${params.toString()}`, {
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      Cookie: 'CONSENT=YES+',
      Referer: 'https://www.google.com/',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
  const parsed = extractGoogleImages(text);
  if (parsed.length) return parsed;

  // Google occasionally returns a normal HTML image page instead of the
  // async JSON envelope. Retry once without `async` and parse its embedded
  // image metadata/URLs.
  const fallbackParams = new URLSearchParams({
    q: query, tbm: 'isch', hl: 'en', gl: 'us',
    safe: safeSearch ? 'active' : 'off',
  });
  const fallbackResponse = await fetch(`${GOOGLE_URL}?${fallbackParams.toString()}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      Cookie: 'CONSENT=YES+',
      Referer: 'https://www.google.com/',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const fallbackText = await fallbackResponse.text();
  if (!fallbackResponse.ok) throw new Error(`Google fallback HTTP ${fallbackResponse.status}`);
  const fallbackResults = extractGoogleImages(fallbackText);
  if (!fallbackResults.length) throw new Error('Google Images returned no parseable results');
  return fallbackResults;
}

async function readSafeSearchSettings() {
  if (settingsCache !== null) return settingsCache;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    settingsCache = data?.safeSearchEnabled !== false;
  } catch {
    settingsCache = true;
  }
  return settingsCache;
}

async function writeSafeSearchSettings(enabled) {
  settingsCache = Boolean(enabled);
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const payload = {
    safeSearchEnabled: settingsCache,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return settingsCache;
}

export async function getSafeSearchEnabled() {
  return readSafeSearchSettings();
}

export async function setSafeSearchEnabled(enabled) {
  return writeSafeSearchSettings(Boolean(enabled));
}

export async function googleImageSearch(query, options = {}) {
  const cleanQuery = clean(query);
  if (!cleanQuery) throw new Error('Image search query required');
  if (cleanQuery.length > 160) throw new Error('Image search query is too long');

  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_MAX_RESULTS, 1), DEFAULT_MAX_RESULTS);
  const safeSearch = options.safeSearch === undefined ? await readSafeSearchSettings() : Boolean(options.safeSearch);

  let all = [];
  const pagesNeeded = Math.max(1, Math.ceil(limit / 100));

  for (let page = 0; page < pagesNeeded; page += 1) {
    const results = await googlePage(cleanQuery, page, safeSearch);
    all.push(...results);
    if (all.length >= limit || !results.length) break;
  }

  all = dedupe(all).slice(0, limit);
  if (!all.length) throw new Error('Google Images returned no usable images');
  return all;
}

export async function prepareImage(item) {
  const candidates = [item?.imageUrl, item?.url, item?.image, item?.thumbnailUrl, item?.thumbnail]
    .filter((url, index, array) => /^https?:\/\//i.test(String(url || '')) && array.indexOf(url) === index);

  for (const value of candidates) {
    try {
      const url = await validatePublicUrl(value);
      const response = await fetch(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;

      const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) continue;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_IMAGE_BYTES) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) continue;

      return { buffer, contentType };
    } catch {
      // Try the next candidate URL.
    }
  }

  return null;
}

export function createToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.replace(/[^a-z0-9]/gi, '');
}

// Keep pending-search state in this module so button actions survive normal
// command dispatch without writing search-result media to disk.
export function savePending(token, data) {
  pendingImages.set(token, {
    ...data,
    createdAt: Date.now(),
  });
}

export function getPending(token) {
  cleanupPendingImages();
  return pendingImages.get(String(token || '')) || null;
}

export function cleanupPendingImages() {
  const now = Date.now();
  for (const [token, data] of pendingImages) {
    if (!data || now - Number(data.createdAt || 0) > PENDING_TTL) pendingImages.delete(token);
  }
}

setInterval(cleanupPendingImages, 5 * 60 * 1000).unref?.();
