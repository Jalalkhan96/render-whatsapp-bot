'use strict';

const crypto = require('crypto');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const social = require('../../lib/social/socialHub');
const { resolveWithFallback } = require('../pindl');
const directPinterest = require('../scrape/engines/pinterest');

const MAX_RESULTS = 5;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;
const SEARCH_TIMEOUT_MS = 90_000;
const DIRECT_TIMEOUT_MS = 25_000;


function randomInt(max) {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return crypto.randomInt(0, Math.max(1, Math.floor(max)));
}

function shuffle(values) {
  const out = Array.isArray(values) ? [...values] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomSample(values, count) {
  const shuffled = shuffle(values);
  return shuffled.slice(0, Math.max(0, Math.min(Number(count) || 0, shuffled.length)));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function firstPath(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const part of path.split('.')) value = value?.[part];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && typeof value.url === 'string' && value.url.trim()) return value.url.trim();
  }
  return '';
}

function isVideoUrl(url) {
  return /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(url || ''));
}

function isImageUrl(url) {
  return /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:[?#]|$)/i.test(String(url || ''));
}

function isPinterestPageUrl(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'pin.it') return true;
    return (host === 'pinterest.com' || host.endsWith('.pinterest.com')) && !host.endsWith('pinimg.com');
  } catch { return false; }
}

function isLikelyMediaUrl(url, hintedType = '') {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'pinterest.com' || host.endsWith('.pinterest.com') || host === 'pin.it') return false;
    const video = isVideoUrl(u.href) || /^video$/i.test(String(hintedType || ''));
    if (video) return isVideoUrl(u.href);
    if (isImageUrl(u.href)) return true;
    return /(^|\.)pinimg\.com$/i.test(host) && /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:[?#]|$)/i.test(u.href);
  } catch { return false; }
}

function normalizeSearchItem(raw, index = 0) {
  const genericUrl = firstPath(raw, ['url']);
  const page = firstPath(raw, [
    'pinUrl', 'pin_url', 'pinterestUrl', 'pinterest_url', 'pinPageUrl', 'pin_page_url',
    'pageUrl', 'page_url', 'link', 'sourceUrl', 'source_url', 'canonicalUrl', 'canonical_url'
  ]) || (genericUrl && !isLikelyMediaUrl(genericUrl, raw?.type || raw?.mediaType) ? genericUrl : '');
  let image = firstPath(raw, [
    'image_original_url', 'imageOriginalUrl', 'image_medium_url', 'imageMediumUrl',
    'image_large_url', 'imageLargeUrl', 'image_url', 'imageUrl', 'image',
    'images.orig.url', 'images.original.url', 'images.0.url',
    'media.image', 'media.image.url', 'thumbnail', 'thumbnailUrl'
  ]);
  let video = firstPath(raw, [
    'video_url', 'videoUrl', 'video', 'media.video', 'media.video.url',
    'videos.0.url', 'videos.0', 'video_list.0.url', 'pin_video'
  ]);

  // The public HTML scraper returns {url, type}; that URL is the media itself,
  // not a Pin page. Do not pass it to the HTML-page resolver.
  const hint = clean(raw?.type || raw?.mediaType || raw?.media_type).toLowerCase();
  if (!image && !video && genericUrl && isLikelyMediaUrl(genericUrl, hint)) {
    if (hint === 'video' || isVideoUrl(genericUrl)) video = genericUrl;
    else image = genericUrl;
  }

  if (image && !isLikelyMediaUrl(image, 'image')) image = '';
  if (video && !isLikelyMediaUrl(video, 'video')) video = '';
  const safePage = isPinterestPageUrl(page) ? page : '';

  return {
    raw,
    index,
    page: safePage,
    image,
    video,
    title: clean(firstPath(raw, ['title', 'description', 'name', 'alt', 'text'])) || `Pinterest result ${index + 1}`,
  };
}

function quotedMedia(message) {
  const context = message?.message?.extendedTextMessage?.contextInfo;
  if (!context?.quotedMessage) return null;
  const quoted = context.quotedMessage;
  if (!quoted?.imageMessage) return null;
  return {
    key: {
      remoteJid: message.key.remoteJid,
      fromMe: false,
      id: context.stanzaId,
      participant: context.participant,
    },
    message: quoted,
  };
}

function currentImage(message) {
  return message?.message?.imageMessage ? { key: message.key, message: message.message } : null;
}

function detectMediaMime(buffer, declaredMime, url) {
  const head = Buffer.from(buffer || Buffer.alloc(0)).subarray(0, 64);
  const text = head.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || text.startsWith('<?xml') || text.startsWith('{"error"')) {
    throw new Error('URL returned an HTML/JSON page, not media');
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (head.length >= 6 && ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (head.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') {
    const brand = head.toString('ascii', 8, 12).toLowerCase();
    return brand === 'qt  ' ? 'video/quicktime' : (brand.includes('avif') ? 'image/avif' : 'video/mp4');
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
  const mime = String(declaredMime || '').split(';')[0].toLowerCase();
  if (/^image\//.test(mime) || /^video\//.test(mime)) return mime;
  const cleanUrl = String(url || '').split(/[?#]/)[0];
  if (/\.(?:jpe?g)$/i.test(cleanUrl)) return 'image/jpeg';
  if (/\.png$/i.test(cleanUrl)) return 'image/png';
  if (/\.gif$/i.test(cleanUrl)) return 'image/gif';
  if (/\.webp$/i.test(cleanUrl)) return 'image/webp';
  if (/\.(?:mp4|m4v)$/i.test(cleanUrl)) return 'video/mp4';
  if (/\.mov$/i.test(cleanUrl)) return 'video/quicktime';
  if (/\.webm$/i.test(cleanUrl)) return 'video/webm';
  throw new Error('URL did not return recognizable image/video media');
}

async function downloadRemote(url, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36 ABIX-PinSearch/2.1',
        Accept: 'image/avif,image/webp,image/*,video/*,application/octet-stream;q=0.9,*/*;q=0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declaredMime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!/^image\//.test(declaredMime) && !/^video\//.test(declaredMime) && !/^(application|binary)\/octet-stream$/.test(declaredMime)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('URL returned a web page instead of media');
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Media exceeds size limit');
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error('Media exceeds size limit');
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const mime = detectMediaMime(buffer, declaredMime, response.url || url);
    if (!buffer.length) throw new Error('Empty media response');
    return { buffer, mime, type: mime.startsWith('video/') ? 'video' : 'image', url: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveItemMediaCandidates(item) {
  const candidates = [];
  if (item.video && isLikelyMediaUrl(item.video, 'video')) candidates.push({ type: 'video', url: item.video });
  if (item.image && isLikelyMediaUrl(item.image, 'image')) candidates.push({ type: 'image', url: item.image });

  if (item.page && isPinterestPageUrl(item.page)) {
    try {
      const info = await resolveWithFallback(item.page);
      for (const url of info.videos || []) if (isLikelyMediaUrl(url, 'video')) candidates.push({ type: 'video', url });
      for (const url of info.images || []) if (isLikelyMediaUrl(url, 'image')) candidates.push({ type: 'image', url });
    } catch (error) {
      console.warn('[PINSEARCH] Could not resolve Pin page:', clean(error?.message || error).slice(0, 120));
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }
  return deduped;
}

async function sendMediaNoCaption(sock, jid, media) {
  if (media.type === 'video') {
    await sock.sendMessage(jid, { video: media.buffer, mimetype: media.mime || 'video/mp4' });
  } else {
    await sock.sendMessage(jid, { image: media.buffer, mimetype: media.mime || 'image/jpeg' });
  }
}

async function sendItemIfMedia(sock, jid, item, seenMedia) {
  const candidates = await resolveItemMediaCandidates(item);
  for (const candidate of candidates) {
    if (seenMedia.has(candidate.url)) continue;
    try {
      const limit = candidate.type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      const downloaded = await downloadRemote(candidate.url, limit);
      const identity = downloaded.url || candidate.url;
      if (seenMedia.has(identity)) continue;
      await sendMediaNoCaption(sock, jid, downloaded);
      seenMedia.add(candidate.url);
      seenMedia.add(identity);
      return true;
    } catch (error) {
      // Candidates are expected to include dead variants/thumbnails; quietly try the next one.
      // Keep candidate failures quiet; some search engines return page URLs or stale CDN variants.
      if (process.env.PINSEARCH_DEBUG === '1') console.warn('[PINSEARCH] Skipping invalid media candidate:', clean(error?.message || error).slice(0, 110));
    }
  }
  return false;
}

function parseSearchArgs(args) {
  const list = Array.isArray(args) ? args.map(clean).filter(Boolean) : [];
  let count = MAX_RESULTS;
  if (/^\d+$/.test(list[0] || '')) {
    count = Math.max(1, Math.min(MAX_RESULTS, Number(list.shift())));
  }
  return { count, query: list.join(' ').trim() };
}

async function pinSearch({ sock, message, args, context, jid }) {
  const { count, query } = parseSearchArgs(args);
  if (!query) {
    return sock.sendMessage(jid, {
      text: `Usage: ${context.prefix || '-'}pinsearch 5 pepe frog`,
    }, { quoted: message });
  }

  await sock.sendMessage(jid, { react: { text: '🔎', key: message.key } }).catch(() => {});

  const chosenUrls = new Set();
  let sent = 0;
  let directError = null;
  let apifyError = null;

  // Free public HTML/CDN scrape first. Browser fallback is disabled here to avoid
  // launching Chromium inside the bot host and adding unnecessary RAM pressure.
  let directItems = [];
  try {
    directItems = await Promise.race([
      directPinterest.scrape(query, {
        limit: Math.max(10, count * 4),
        timeoutMs: 18_000,
        browserFallback: false,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Direct Pinterest search timed out.')), DIRECT_TIMEOUT_MS)),
    ]);
  } catch (error) {
    directError = error;
    console.warn('[PINSEARCH] Direct scraper did not return results:', clean(error?.message || error).slice(0, 180));
  }

  for (const raw of shuffle(Array.isArray(directItems) ? directItems : [])) {
    if (sent >= count) break;
    const item = normalizeSearchItem(raw, sent);
    if (await sendItemIfMedia(sock, jid, item, chosenUrls)) sent += 1;
  }

  // Apify remains a backup/top-up only. Do not invoke a paid actor if direct
  // public media already filled the requested count.
  if (sent < count) {
    try {
      const result = await Promise.race([
        social.pinterestSearch(query, {
          maxPinsPerSource: Math.max(10, count * 3),
          downloadMedia: false,
          enrichDetails: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pinterest Apify backup timed out.')), SEARCH_TIMEOUT_MS)),
      ]);
      const rawItems = Array.isArray(result?.items) ? result.items : [];
      const items = rawItems.map((raw, index) => normalizeSearchItem(raw, index)).filter(item => item.page || item.image || item.video);
      for (const item of shuffle(items)) {
        if (sent >= count) break;
        if (await sendItemIfMedia(sock, jid, item, chosenUrls)) sent += 1;
      }
    } catch (error) {
      apifyError = error;
      console.warn('[PINSEARCH] Apify backup unavailable; keeping any direct results:', clean(error?.message || error).slice(0, 240));
    }
  }

  if (!sent) {
    const reasons = [];
    if (directError) reasons.push(`direct scraper: ${clean(directError.message).slice(0, 100)}`);
    if (apifyError) {
      const message = clean(apifyError.message);
      reasons.push(/APIFY_BILLING_EXHAUSTED|HTTP 402|not-enough-usage-to-run-paid-actor/i.test(message)
        ? 'Apify backup is unavailable because the account has insufficient paid-actor usage; token rotation will not fix this. Direct search was attempted.'
        : `Apify backup: ${message.slice(0, 135)}`);
    }
    throw new Error(`No downloadable public Pinterest media found.${reasons.length ? ` ${reasons.join(' | ')}` : ' Search returned no fetchable image/video URLs.'}`);
  }

  await sock.sendMessage(jid, { react: { text: '✅', key: message.key } }).catch(() => {});
  return sent;
}

async function pinLens({ sock, message, jid }) {
  const source = quotedMedia(message) || currentImage(message);
  if (!source) {
    return sock.sendMessage(jid, {
      text: '🖼️ Reply to an image with -pinslr to find similar Pinterest images.',
    }, { quoted: message });
  }

  await sock.sendMessage(jid, { react: { text: '🔎', key: message.key } }).catch(() => {});
  const buffer = await downloadMediaMessage(source, 'buffer', {}, {
    logger: console,
    reuploadRequest: sock.updateMediaMessage,
  });

  const base64 = Buffer.from(buffer).toString('base64');
  const result = await Promise.race([
    social.pinterestLens(base64, { maxResults: MAX_RESULTS }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Pinterest visual search timed out.')), SEARCH_TIMEOUT_MS)),
  ]);

  const rawItems = Array.isArray(result?.items) ? result.items : [];
  const lensUrls = unique(rawItems.map(item => firstPath(item, [
    'image_original_url', 'imageOriginalUrl', 'image_large_url', 'imageLargeUrl',
    'image_medium_url', 'imageMediumUrl', 'image_url', 'imageUrl', 'image',
    'thumbnail', 'thumbnailUrl'
  ])).filter(Boolean));
  // Random sample on every visual-search invocation.
  const urls = randomSample(lensUrls, MAX_RESULTS);

  if (!urls.length) throw new Error('Pinterest Lens returned no similar images.');

  let sent = 0;
  for (const url of urls) {
    try {
      const downloaded = await downloadRemote(url, MAX_IMAGE_BYTES);
      if (downloaded.type !== 'image') continue;
      // Deliberately no caption, no quote, no fake-forward payload.
      await sock.sendMessage(jid, {
        image: downloaded.buffer,
        mimetype: downloaded.mime || 'image/jpeg',
      });
      sent += 1;
      if (sent >= MAX_RESULTS) break;
    } catch (error) {
      console.error('[PINSLR MEDIA]', error?.message || error);
    }
  }

  await sock.sendMessage(jid, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
  return sent;
}

async function pinSearchHandler(sock, message, args = [], context = {}) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) return;
  try {
    return await pinSearch({ sock, message, args, context, jid });
  } catch (error) {
    await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
    console.error('[PINSEARCH]', error?.stack || error);
    return sock.sendMessage(jid, {
      text: `❌ Pinterest search failed: ${clean(error?.message || error).slice(0, 260)}`,
    }, { quoted: message });
  }
}

async function pinLensHandler(sock, message, args = [], context = {}) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) return;
  try {
    return await pinLens({ sock, message, jid });
  } catch (error) {
    await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
    console.error('[PINSLR]', error?.stack || error);
    return sock.sendMessage(jid, {
      text: `❌ Pinterest visual search failed: ${clean(error?.message || error).slice(0, 260)}`,
    }, { quoted: message });
  }
}

module.exports = [
  {
    command: 'pinsearch',
    aliases: ['psearch', 'pinterestsearch', 'pin-s'],
    category: 'social-search',
    description: 'Pinterest media search: send up to 5 related images/videos with no caption or fake-forward metadata.',
    usage: '-pinsearch 5 pepe frog',
    handler: pinSearchHandler,
  },
  {
    command: 'pinslr',
    aliases: ['pinsimilar', 'pinlens', 'pinterestlens', 'pinsim'],
    category: 'social-search',
    description: 'Reply to an image to find visually similar public Pinterest images.',
    usage: '-pinslr (reply to image)',
    handler: pinLensHandler,
  },
];
