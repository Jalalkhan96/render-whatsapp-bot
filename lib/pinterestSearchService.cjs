'use strict';

const direct = require('../plugins2/scrape/engines/pinterest/index.cjs');
const social = require('./social/socialHub');

const MAX_LIMIT = 30;
const MEDIA_HOST_RE = /(^|\.)pinimg\.com$/i;
const VIDEO_RE = /\.(?:mp4|webm|mov|m4v|m3u8)(?:$|[?#])/i;

function clamp(value, fallback = 5, max = MAX_LIMIT) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : fallback;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch { return null; }
}

function isMediaUrl(value) {
  const url = safeUrl(value);
  return Boolean(url && MEDIA_HOST_RE.test(url.hostname));
}

function isPinterestPage(value) {
  const url = safeUrl(value);
  return Boolean(url && /(^|\.)pinterest\.com$|(^|\.)pin\.it$/i.test(url.hostname));
}

function kindOf(url, hint = '') {
  if (/video|stream|mp4|video_list/i.test(String(hint || '')) || VIDEO_RE.test(String(url || '')) || /\/videos?\//i.test(String(url || ''))) return 'video';
  return 'image';
}

function getPath(obj, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], obj);
}

function firstUrl(obj, paths, validator = () => true) {
  for (const path of paths) {
    let value = getPath(obj, path);
    if (value && typeof value === 'object') value = value.url || value.src || value.originalUrl;
    if (typeof value === 'string' && validator(value)) return value;
  }
  return '';
}

function collectMedia(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return [];
  const title = text(firstUrl(raw, ['title', 'grid_title', 'description', 'caption', 'alt', 'name'])) || `Pinterest result ${index + 1}`;
  const out = [];
  const add = (url, type, source = 'apify') => {
    if (typeof url !== 'string' || !isMediaUrl(url)) return;
    out.push({ type: type === 'video' ? 'video' : kindOf(url), url, title, description: title, source });
  };

  // The Apify actor uses several field names depending on its output mode.
  add(firstUrl(raw, ['video_url', 'videoUrl', 'videos.0.url', 'videos.0', 'video.url', 'video', 'media.video.url', 'media.video', 'pin_video.url']), 'video');
  for (const path of [
    'image_original_url', 'imageOriginalUrl', 'image_large_url', 'imageLargeUrl',
    'image_medium_url', 'imageMediumUrl', 'image_url', 'imageUrl', 'image',
    'images.orig.url', 'images.original.url', 'images.originals.url', 'images.0.url',
    'media.image.url', 'media.image', 'thumbnail', 'thumbnailUrl', 'image.src',
  ]) add(firstUrl(raw, [path]), 'image');

  // Harvest nested media fields without accidentally promoting a Pin page URL.
  function walk(value, path = '') {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}.${i}`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string' && isMediaUrl(child)) {
        const type = kindOf(child, nextPath);
        if (type === 'video' || /image|img|thumbnail|original|src/i.test(nextPath)) add(child, type);
      } else if (child && typeof child === 'object') walk(child, nextPath);
    }
  }
  walk(raw);

  const page = firstUrl(raw, [
    'pinUrl', 'pin_url', 'pinterestUrl', 'pinterest_url', 'sourceUrl', 'source_url',
    'canonicalUrl', 'canonical_url', 'pageUrl', 'page_url', 'permalink', 'link', 'url',
  ], isPinterestPage);
  const seen = new Set();
  return out.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    item.page = page || '';
    return true;
  });
}

function normalizeApify(payload, limit) {
  const rawItems = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  const out = [];
  const seen = new Set();
  rawItems.forEach((raw, index) => {
    for (const item of collectMedia(raw, index)) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({
        id: `pinterest:apify:${out.length + 1}`,
        platform: 'pinterest',
        ...item,
        searchQuery: text(raw?.query || raw?.searchQuery || ''),
      });
      if (out.length >= limit) return;
    }
  });
  return out.slice(0, limit);
}

async function apifySearch(query, { limit = 5 } = {}) {
  const result = await social.pinterestSearch(String(query || ''), {
    maxPinsPerSource: Math.max(10, Math.min(100, limit * 4)),
    downloadMedia: false,
    enrichDetails: true,
  });
  const items = normalizeApify(result, limit);
  if (!items.length) throw new Error('Apify returned no usable Pinterest image/video URLs.');
  return { items, provider: 'apify', directCount: 0, apifyCount: items.length };
}

async function search(input, options = {}) {
  const query = text(input);
  if (!query) throw new Error('Pinterest query/URL is required.');
  const limit = clamp(options.limit, 5, MAX_LIMIT);
  const queryIsUrl = /^https?:\/\//i.test(query);
  if (queryIsUrl && !isPinterestPage(query) && !isMediaUrl(query)) {
    throw new Error('For URL mode, provide a public Pinterest Pin/page URL or Pinterest CDN media URL.');
  }
  const apifyOnly = options.apifyOnly === true;
  const directOnly = options.directOnly === true;
  const similar = options.similar === true;
  const mediaType = ['image', 'video'].includes(String(options.mediaType || '').toLowerCase())
    ? String(options.mediaType).toLowerCase() : 'all';

  if (apifyOnly) return apifySearch(query, { limit });
  // A direct Pinterest CDN URL is already the media asset; do not try to parse
  // the binary response as an HTML search page.
  if (queryIsUrl && isMediaUrl(query) && !similar) {
    const type = kindOf(query);
    if (mediaType !== 'all' && mediaType !== type) throw new Error('The provided Pinterest CDN URL is not the requested media type.');
    return {
      items: [{ id: 'pinterest:direct-url', platform: 'pinterest', type, url: query, title: '', description: '', source: 'direct_media_url', provider: 'direct' }],
      provider: 'direct', directCount: 1, apifyCount: 0,
    };
  }

  let directItems = [];
  let directError = null;
  try {
    directItems = similar
      ? await direct.searchSimilar(query, { maxPins: limit, limit, scrolls: options.scrolls ?? 2, mediaType })
      : await direct.scrape(query, { limit, scrolls: options.scrolls ?? 3, timeoutMs: options.timeoutMs, mediaType });
  } catch (error) { directError = error; }

  const merged = [];
  const seen = new Set();
  for (const item of directItems || []) {
    if (!item?.url || seen.has(item.url)) continue;
    if (mediaType !== 'all' && item.type !== mediaType) continue;
    seen.add(item.url);
    merged.push({ ...item, provider: 'direct' });
  }

  let backupQuery = query;
  if (similar && queryIsUrl && isPinterestPage(query)) {
    const title = await direct.extractPageTitle(query, Number(options.timeoutMs) || 25000).catch(() => '');
    const pinId = query.match(/\/pin\/(\d+)/i)?.[1];
    backupQuery = title || (pinId ? `Pinterest pin ${pinId}` : 'Pinterest inspiration');
  }
  const mayUseApify = !directOnly && options.apifyFallback !== false && (!queryIsUrl || similar);
  let apifyCount = 0;
  let apifyError = null;
  if (mayUseApify && merged.length < limit) {
    try {
      const response = await apifySearch(backupQuery, { limit: Math.max(limit * 2, 10) });
      for (const item of response.items) {
        if (merged.length >= limit || seen.has(item.url)) continue;
        if (mediaType !== 'all' && item.type !== mediaType) continue;
        seen.add(item.url);
        merged.push({ ...item, provider: 'apify' });
        apifyCount += 1;
      }
    } catch (error) { apifyError = error; }
  }

  if (!merged.length) {
    if (directError && apifyError) throw new Error(`Direct Pinterest scrape failed: ${text(directError.message)}; Apify backup failed: ${text(apifyError.message)}`.slice(0, 600));
    if (directError && !mayUseApify) throw directError;
    if (apifyError) throw apifyError;
    throw new Error('Pinterest returned no public media. Try again or use -pinapify <query>.');
  }

  return {
    items: merged.slice(0, limit),
    provider: apifyCount && directItems.length ? 'direct+apify' : apifyCount ? 'apify-fallback' : 'direct',
    directCount: directItems.length,
    apifyCount,
    directError: directError ? text(directError.message) : '',
  };
}

async function downloadMediaBuffer(item, options = {}) {
  const url = String(item?.url || '').trim();
  if (!isMediaUrl(url)) throw new Error('Pinterest media URL is invalid or not hosted on pinimg.com.');
  const type = item?.type === 'video' ? 'video' : 'image';
  if (type === 'video' && /\.m3u8(?:$|[?#])/i.test(url)) throw new Error('Pinterest returned an HLS playlist, not a directly sendable video file.');
  const maxBytes = Math.max(1024 * 1024, Math.min(type === 'video' ? 50 : 12, Number(options.maxMb) || (type === 'video' ? 50 : 12)) * 1024 * 1024);
  const timeoutMs = Math.max(5000, Math.min(60000, Number(options.timeoutMs) || 45000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
        Accept: 'image/*,video/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Pinterest media HTTP ${response.status}`);
    if (!isMediaUrl(response.url || url)) throw new Error('Pinterest media redirected outside its CDN host.');
    const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (/^(text\/html|application\/(?:json|xml)|text\/plain)/i.test(mime)) throw new Error('Pinterest CDN returned a web page/error instead of media.');
    if (mime && !/^(image|video)\//i.test(mime) && mime !== 'application/octet-stream') {
      throw new Error(`Pinterest returned unsupported media type: ${mime}`);
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > maxBytes) throw new Error(`Pinterest media exceeds ${Math.round(maxBytes / 1024 / 1024)} MB size limit.`);
    if (!response.body) throw new Error('Pinterest response had no media body.');
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error(`Pinterest media exceeds ${Math.round(maxBytes / 1024 / 1024)} MB size limit.`);
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks, total);
    if (!buffer.length) throw new Error('Pinterest returned an empty media file.');
    const beginning = buffer.subarray(0, 128).toString('utf8').trimStart().toLowerCase();
    if (beginning.startsWith('<!doctype html') || beginning.startsWith('<html') || beginning.startsWith('{"error"')) {
      throw new Error('Pinterest CDN returned an HTML/JSON error, not media.');
    }
    if (type === 'video' && mime === 'application/octet-stream') {
      const mp4 = buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
      const webm = buffer.length > 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (!mp4 && !webm) throw new Error('Pinterest video bytes do not look like a supported MP4/WebM file.');
    }
    return { buffer, mime: mime || (type === 'video' ? 'video/mp4' : 'image/jpeg'), url: response.url || url, type };
  } finally { clearTimeout(timer); }
}

async function sendPinterestMedia(sock, jid, item, options = {}) {
  const downloaded = await downloadMediaBuffer(item, options);
  if (downloaded.type === 'video') {
    return sock.sendMessage(jid, { video: downloaded.buffer, mimetype: /^video\//.test(downloaded.mime) ? downloaded.mime : 'video/mp4' });
  }
  return sock.sendMessage(jid, { image: downloaded.buffer, mimetype: /^image\//.test(downloaded.mime) ? downloaded.mime : 'image/jpeg' });
}

module.exports = {
  search,
  apifySearch,
  normalizeApify,
  collectMedia,
  isMediaUrl,
  isPinterestPage,
  downloadMediaBuffer,
  sendPinterestMedia,
};
