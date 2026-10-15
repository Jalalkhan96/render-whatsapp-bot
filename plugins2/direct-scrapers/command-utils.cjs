'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { isBlockedAdultUrl, hasBlockedAdultTargetSelector } = require('../../lib/contentRestrictions');
function getCheerio() { return require('cheerio'); }

const sessions = new Map();
const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSION_BUCKETS = 8;
const MAX_THUMBNAIL_BYTES = readBoundedInt('MDSCRAPE_MAX_THUMBNAIL_BYTES', 128 * 1024, 2 * 1024 * 1024, 512 * 1024);
const MAX_MEDIA_DOWNLOAD_BYTES = readBoundedInt('MDSCRAPE_MAX_DOWNLOAD_BYTES', 1 * 1024 * 1024, 64 * 1024 * 1024, 32 * 1024 * 1024);
// Video-first slider: one video per message, with MORE VIDEO pagination.
const MAX_CARDS = 1;
const MAX_SESSION_RESULTS = readBoundedInt('MDSCRAPE_MAX_SESSION_RESULTS', 20, 40, 30);
const UA = process.env.MDSCRAPE_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function readBoundedInt(name, min, max, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function normalizeSiteAlias(value) {
  const raw = String(value || '').trim().toLowerCase();
  const key = raw.replace(/[^a-z0-9]+/g, '');
  // Common user shorthand accepted by site-specific commands.
  const aliases = { animepictures: 'anime_pictures', seiganicovideo: 'seiga_nicovideo' };
  return aliases[key] || raw;
}

function parseOptions(args, totalTargets) {
  const values = Array.isArray(args) ? args.map(value => String(value)) : [];
  let maxTargets = 1;
  // Keep enough candidates in RAM for 10-card pages and a More button.
  let perSiteLimit = 30;
  let all = false;
  let site = "";
  let listSites = false;
  const queryParts = [];

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === '--all') {
      all = true;
      continue;
    }
    if (value === '--list-sites' || value === '--sites-list' || value === '--help-sites') {
      listSites = true;
      continue;
    }
    const siteMatch = value.match(/^--site=(.+)$/i);
    if (siteMatch) { site = normalizeSiteAlias(siteMatch[1]); continue; }
    if (value === '--site' && values[i + 1]) { site = normalizeSiteAlias(values[++i]); continue; }
    const sitesMatch = value.match(/^--sites=(\d+)$/i);
    if (sitesMatch) {
      maxTargets = Number(sitesMatch[1]);
      continue;
    }
    if (value === '--sites' && /^\d+$/.test(values[i + 1] || '')) {
      maxTargets = Number(values[++i]);
      continue;
    }
    const perSiteMatch = value.match(/^--per-site=(\d+)$/i);
    if (perSiteMatch) {
      perSiteLimit = Number(perSiteMatch[1]);
      continue;
    }
    queryParts.push(value);
  }

  if (site && (hasBlockedAdultTargetSelector(`--site=${site}`) || /porn|hentai|nsfw|xvideos|xnxx|redgifs|eporner|erome|tnaflix|youporn|redtube/i.test(site))) {
    throw new Error('Adult-content sources are disabled for everyone.');
  }
  maxTargets = all ? totalTargets : Math.max(1, Math.min(totalTargets, Number.isFinite(maxTargets) ? maxTargets : 12));
  perSiteLimit = Math.max(1, Math.min(40, Number.isFinite(perSiteLimit) ? perSiteLimit : 30));
  if (hasBlockedAdultTargetSelector(values.join(' '))) throw new Error('Adult-content sources are disabled for everyone.');
  return { query: queryParts.join(' ').trim(), maxTargets, perSiteLimit, all, site, listSites };
}

function cleanText(value, max = 120) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicHttpUrl(raw, base) {
  try {
    if (raw === null || raw === undefined || !String(raw).trim()) return null;
    const url = base ? new URL(String(raw).trim(), base) : new URL(String(raw).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (isBlockedAdultUrl(url.href)) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
    const family = net.isIP(host);
    if (family === 4) {
      const octets = host.split('.').map(Number);
      const [a, b] = octets;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
          (a === 100 && b >= 64 && b <= 127)) return null;
    } else if (family === 6) {
      if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
          host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb') ||
          host.startsWith('::ffff:127.') || host.startsWith('::ffff:10.') || host.startsWith('::ffff:192.168.')) return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function extOf(url) {
  try {
    const match = new URL(url).pathname.toLowerCase().match(/\.(mp4|m4v|webm|mov|avi|mkv|jpg|jpeg|png|webp|gif|bmp|avif)(?:$)/i);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function typeFromUrl(url) {
  const ext = extOf(url);
  if (['mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  return '';
}

function expectsVideoMedia(item) {
  return /^(mainstream|animation|3d_animation|cartoon|vr_360)$/i.test(String(item?.category || ''));
}

function meta($, selector) {
  return cleanText($(selector).first().attr('content') || '', 2048);
}

function firstUsableUrl(values, base) {
  for (const value of values) {
    const url = publicHttpUrl(value, base);
    if (url) return url;
  }
  return '';
}

function imageCandidatesFromHtml($, baseUrl) {
  const values = [
    meta($, 'meta[property="og:image:secure_url"]'),
    meta($, 'meta[property="og:image"]'),
    meta($, 'meta[name="twitter:image"]'),
    meta($, 'meta[name="twitter:image:src"]'),
    $('link[rel="image_src"]').first().attr('href'),
    $('meta[itemprop="image"]').first().attr('content'),
  ];
  $('img').each((_, el) => {
    if (values.length > 50) return;
    const img = $(el);
    values.push(img.attr('data-original'), img.attr('data-src'), img.attr('data-lazy-src'), img.attr('src'));
  });
  return values.map(value => publicHttpUrl(value, baseUrl)).filter(Boolean);
}

function videoOptionsFromHtml($, baseUrl) {
  const options = [];
  const seen = new Set();
  const normalizeEscaped = value => String(value || '')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\x2[fF]/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\\u003[dD]/g, '=')
    .trim();
  const classifyQuality = (value, explicitLabel = '') => {
    const hay = `${explicitLabel} ${value}`.toLowerCase();
    if (/(?:240\s?p|240p|quality[=_/-]?240|(?:height|res|resolution)[=_/-]?240|[_/-]240(?:p|[_./?-]))/.test(hay)) return '240p';
    if (/(?:480\s?p|480p|quality[=_/-]?480|(?:height|res|resolution)[=_/-]?480|[_/-]480(?:p|[_./?-]))/.test(hay)) return '480p';
    return '';
  };
  const add = (raw, quality, label) => {
    const url = publicHttpUrl(normalizeEscaped(raw), baseUrl);
    if (!url || !/^https?:/i.test(url) || !/\.(?:mp4|m4v|webm|mov)(?:$|[?#])/i.test(url)) return;
    // Reject streams that advertise more than 480p even if a source labels them LOW.
    if (/(?:720p|1080p|1440p|2160p|quality[=_/-]?(?:720|1080|1440|2160)|(?:height|res|resolution)[=_/-]?(?:720|1080|1440|2160))/.test(url.toLowerCase())) return;
    if (!['240p', '480p', 'low'].includes(quality)) return;
    if (seen.has(url)) return;
    seen.add(url);
    options.push({ quality, label: label || (quality === 'low' ? 'LOW' : quality.toUpperCase()), url });
  };

  // Only explicit 240p/480p and player-marked LOW streams are accepted.
  // High-quality functions and HLS master playlists are intentionally ignored.
  $('script').each((_, el) => {
    const scriptText = $(el).contents().text() || '';
    if (!scriptText || scriptText.length > 2 * 1024 * 1024) return;
    const directPatterns = [
      { re: /(?:html5player\.)?setVideoUrl240(?:p)?\s*\(\s*(['"])(.*?)\1/gi, quality: '240p' },
      { re: /(?:html5player\.)?setVideoUrl480(?:p)?\s*\(\s*(['"])(.*?)\1/gi, quality: '480p' },
      { re: /(?:html5player\.)?setVideoUrlLow\s*\(\s*(['"])(.*?)\1/gi, quality: 'low' },
      { re: /(?:videoUrl|video_url|contentUrl|content_url)[_\s-]*(240p?)\s*[=:]\s*(['"])(.*?)\2/gi, quality: '240p', group: 3 },
      { re: /(?:videoUrl|video_url|contentUrl|content_url)[_\s-]*(480p?)\s*[=:]\s*(['"])(.*?)\2/gi, quality: '480p', group: 3 },
    ];
    for (const pattern of directPatterns) {
      let match;
      while ((match = pattern.re.exec(scriptText)) !== null) {
        const value = pattern.group ? match[pattern.group] : match[2];
        const resolvedUrlQuality = classifyQuality(value);
        const quality = pattern.quality === 'low' ? (resolvedUrlQuality || 'low') : pattern.quality;
        add(value, quality, quality === 'low' ? 'LOW' : quality.toUpperCase());
      }
    }
    const safeScript = scriptText.replace(/(?:html5player\.)?setVideoUrlHigh\s*\(\s*(['"])(.*?)\1/gi, '');
    const directUrlRe = /https?:\\?\/\\?\/[^\s'"<>\\]+?\.(?:mp4|m4v|webm|mov)(?:\?[^\s'"<>\\]*)?/gi;
    let match;
    while ((match = directUrlRe.exec(safeScript)) !== null) {
      const url = normalizeEscaped(match[0]);
      const quality = classifyQuality(url);
      if (quality) add(url, quality, quality.toUpperCase());
    }
  });

  for (const value of [
    $('video').first().attr('src'),
    $('video source').first().attr('src'),
    $('source[type^="video/"]').first().attr('src'),
    meta($, 'meta[property="og:video:secure_url"]'),
    meta($, 'meta[property="og:video:url"]'),
    meta($, 'meta[property="og:video"]'),
    meta($, 'meta[name="twitter:player:stream"]'),
    meta($, 'meta[itemprop="contentUrl"]'),
  ]) {
    const quality = classifyQuality(value);
    if (quality) add(value, quality, quality.toUpperCase());
  }
  const rank = { '240p': 0, '480p': 1, low: 2 };
  return options.sort((a, b) => rank[a.quality] - rank[b.quality]).slice(0, 3);
}

function extractMediaFromHtml(html, pageUrl) {
  const $ = getCheerio().load(String(html || ''));
  const images = imageCandidatesFromHtml($, pageUrl);
  const mediaOptions = videoOptionsFromHtml($, pageUrl);
  const thumbnailUrl = images[0] || '';
  if (mediaOptions.length) return { mediaUrl: mediaOptions[0].url, mediaType: 'video', thumbnailUrl, mediaOptions };
  if (thumbnailUrl) return { mediaUrl: thumbnailUrl, mediaType: 'image', thumbnailUrl, mediaOptions: [] };
  return { mediaUrl: '', mediaType: '', thumbnailUrl: '', mediaOptions: [] };
}

async function fetchPublicResponse(rawUrl, options = {}, maxRedirects = 4) {
  let current = publicHttpUrl(rawUrl);
  if (!current) throw new Error('Rejected a non-public or invalid URL.');
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current, {
      ...options,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(9000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch {}
      if (!location || redirects === maxRedirects) throw new Error('Too many or invalid media redirects.');
      current = publicHttpUrl(location, current);
      if (!current) throw new Error('Blocked a redirect to a non-public URL.');
      continue;
    }
    if (!publicHttpUrl(response.url || current)) {
      try { await response.body?.cancel(); } catch {}
      throw new Error('Blocked a non-public response URL.');
    }
    return response;
  }
  throw new Error('Too many redirects.');
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await response.body?.cancel(); } catch {}
    throw new Error(`Media exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`);
  }
  if (!response.body?.getReader) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) throw new Error('Response exceeds the configured size limit.');
    return Buffer.from(arrayBuffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Media exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

async function enrichOne(item) {
  const pageUrl = publicHttpUrl(item?.url);
  const fallbackThumb = publicHttpUrl(item?.thumbnailUrl || item?.thumb || '');
  if (!pageUrl) return { ...item, mediaUrl: '', mediaType: '', thumbnailUrl: fallbackThumb || '' };
  const directType = typeFromUrl(pageUrl);
  if (directType === 'image') {
    return { ...item, mediaUrl: pageUrl, mediaType: 'image', thumbnailUrl: pageUrl, mediaOptions: [] };
  }
  if (directType === 'video') {
    const qualityText = `${pageUrl} ${item?.title || ''}`.toLowerCase();
    const quality = /(?:240p|quality[=_/-]?240|height[=_/-]?240)/.test(qualityText) ? '240p'
      : /(?:480p|quality[=_/-]?480|height[=_/-]?480)/.test(qualityText) ? '480p' : '';
    const mediaOptions = quality ? [{ quality, label: quality.toUpperCase(), url: pageUrl }] : [];
    return { ...item, mediaUrl: mediaOptions[0]?.url || '', mediaType: mediaOptions.length ? 'video' : '', mediaOptions, thumbnailUrl: fallbackThumb };
  }

  try {
    const response = await fetchPublicResponse(pageUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.7', Referer: new URL(pageUrl).origin },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      try { await response.body?.cancel(); } catch {}
      return { ...item, mediaUrl: response.url || pageUrl, mediaType: 'image', thumbnailUrl: response.url || pageUrl, mediaOptions: [] };
    }
    if (contentType.startsWith('video/')) {
      try { await response.body?.cancel(); } catch {}
      const streamUrl = response.url || pageUrl;
      const quality = /(?:240p|quality[=_/-]?240|height[=_/-]?240)/i.test(streamUrl) ? '240p'
        : /(?:480p|quality[=_/-]?480|height[=_/-]?480)/i.test(streamUrl) ? '480p' : '';
      const mediaOptions = quality ? [{ quality, label: quality.toUpperCase(), url: streamUrl }] : [];
      return { ...item, mediaUrl: mediaOptions[0]?.url || '', mediaType: mediaOptions.length ? 'video' : '', mediaOptions, thumbnailUrl: fallbackThumb || '' };
    }
    if (!contentType.includes('html') && !contentType.includes('xhtml') && !contentType.includes('text/')) {
      try { await response.body?.cancel(); } catch {}
      return { ...item, mediaUrl: fallbackThumb || '', mediaType: fallbackThumb ? 'image' : '', thumbnailUrl: fallbackThumb || '' };
    }

    const html = (await readLimited(response, 3 * 1024 * 1024)).toString('utf8');
    const parsed = extractMediaFromHtml(html, response.url || pageUrl);
    const thumbnailUrl = parsed.thumbnailUrl || fallbackThumb || '';
    if (parsed.mediaType === 'video' && parsed.mediaUrl) {
      return { ...item, mediaUrl: parsed.mediaUrl, mediaType: 'video', mediaOptions: parsed.mediaOptions || [], thumbnailUrl };
    }
    // For video-oriented sites, never label a poster/thumbnail as the media
    // download. Keep the preview URL only and hide the Download button unless
    // a direct video stream was extracted.
    if (expectsVideoMedia(item)) {
      return { ...item, mediaUrl: '', mediaType: '', mediaOptions: [], thumbnailUrl, mediaNote: 'No direct 240p/480p or site-marked low stream was exposed by this source.' };
    }
    const imageUrl = parsed.mediaUrl || thumbnailUrl;
    return { ...item, mediaUrl: imageUrl, mediaType: imageUrl ? 'image' : '', mediaOptions: [], thumbnailUrl: thumbnailUrl || imageUrl };
  } catch (error) {
    if (expectsVideoMedia(item)) {
      return { ...item, mediaUrl: '', mediaType: '', mediaOptions: [], thumbnailUrl: fallbackThumb || '', mediaNote: 'No direct 240p/480p or site-marked low stream was exposed by this source.' };
    }
    // Image/gallery searches may use a public thumbnail as the actual image
    // result; never apply this fallback to video-only target categories.
    if (fallbackThumb) return { ...item, mediaUrl: fallbackThumb, mediaType: 'image', mediaOptions: [], thumbnailUrl: fallbackThumb, mediaNote: 'thumbnail fallback' };
    return { ...item, mediaUrl: '', mediaType: '', mediaOptions: [], thumbnailUrl: '' };
  }
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { output[index] = await mapper(items[index], index); }
      catch { output[index] = { ...items[index], mediaUrl: '', mediaType: '', thumbnailUrl: '' }; }
    }
  });
  await Promise.all(workers);
  return output;
}

function sessionBucket(chatId) {
  let bucket = sessions.get(chatId);
  if (!bucket) {
    bucket = new Map();
    sessions.set(chatId, bucket);
  }
  for (const [token, value] of bucket) {
    if (value.expires < Date.now()) bucket.delete(token);
  }
  return bucket;
}

function rememberSession(chatId, command, query, results) {
  const token = crypto.randomBytes(5).toString('hex');
  const bucket = sessionBucket(chatId);
  bucket.set(token, { command, query, results, expires: Date.now() + SESSION_TTL_MS });
  while (bucket.size > MAX_SESSION_BUCKETS) bucket.delete(bucket.keys().next().value);
  return token;
}

function getSession(chatId, token, command) {
  const session = sessionBucket(chatId).get(String(token || ''));
  if (!session || session.expires < Date.now() || session.command !== command) return null;
  return session;
}

function quickButton(label, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: label, id }) };
}

function actionCommandId(prefix, alias, action, token, index, quality = '') {
  return `${prefix}${alias} __${action} ${token} ${index}${quality ? ` ${quality}` : ''}`;
}

async function imageBufferFromUrl(rawUrl) {
  const url = publicHttpUrl(rawUrl);
  if (!url) return null;
  try {
    const response = await fetchPublicResponse(url, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5' },
    });
    if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
      try { await response.body?.cancel(); } catch {}
      return null;
    }
    const buffer = await readLimited(response, MAX_THUMBNAIL_BYTES);
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

async function renderMediaPage(sock, chatId, session, token, pageIndex, prefix, callbackAlias) {
  const { sendInteractiveMessage } = require('../../lib/interactiveMenu');
  const results = session.results;
  const pageCount = Math.max(1, results.length);
  let page = Math.max(0, Math.min(pageCount - 1, Number(pageIndex) || 0));
  let item = results[page];

  // Resolve serially to keep memory/cpu use low on constrained hosting.
  while (item && !item._mediaResolved) {
    const [resolved] = await mapLimit([item], 1, enrichOne);
    item = { ...resolved, _mediaResolved: true };
    session.results[page] = item;
  }

  // Skip results that are images or expose no safe low-quality stream.
  while (item && (item.mediaType !== 'video' || !Array.isArray(item.mediaOptions) || !item.mediaOptions.some(option => ['240p', '480p', 'low'].includes(option.quality)))) {
    page += 1;
    if (page >= results.length) break;
    item = results[page];
    if (!item._mediaResolved) {
      const [resolved] = await mapLimit([item], 1, enrichOne);
      item = { ...resolved, _mediaResolved: true };
      session.results[page] = item;
    }
  }

  if (!item || page >= results.length) {
    return sock.sendMessage(chatId, {
      text: '⚠️ No downloadable low-quality video was found in the remaining results. Available options are only explicit 240p, 480p, or a source-marked LOW stream. High-quality downloads are disabled.',
      _skipForwardContext: true,
    });
  }

  const preview = await imageBufferFromUrl(item.thumbnailUrl || '');
  const title = cleanText(item.title || item.platform || 'Video result', 60);
  const description = [
    `🌐 ${cleanText(item.platform || 'Website', 30)}`,
    '🎞️ Video • low-quality downloads only',
    `🔎 ${cleanText(item.url, 130)}`,
  ].join('\n');
  const buttons = [];
  const seenQuality = new Set();
  for (const option of (item.mediaOptions || [])) {
    if (!['240p', '480p', 'low'].includes(option.quality) || seenQuality.has(option.quality)) continue;
    seenQuality.add(option.quality);
    const label = option.quality === 'low' ? '⬇️ DOWNLOAD LOW' : `⬇️ DOWNLOAD ${option.quality.toUpperCase()}`;
    buttons.push(quickButton(label, actionCommandId(prefix, callbackAlias, 'download', token, page, option.quality)));
  }
  if (page < results.length - 1) buttons.push(quickButton('➡️ MORE VIDEO', actionCommandId(prefix, callbackAlias, 'page', token, page + 1)));

  if (!preview) {
    return sendInteractiveMessage(sock, chatId, {
      header: { title },
      body: `🎬 *${session.command === 'masterdirect2' ? 'MASTER DIRECT SCRAPER 2' : 'MASTER DIRECT SCRAPER 1'}*\nQuery: *${cleanText(session.query, 100)}*\nVideo ${page + 1}/${results.length}\nNo public thumbnail was accessible.\n\n${description}`,
      footer: 'ABIX-AE • Video search',
      buttons,
    }, { nativeInteractive: true, quoted: undefined });
  }

  return sendInteractiveMessage(sock, chatId, {
    header: { title, media: preview, mediaType: 'image' },
    body: `🎬 *${session.command === 'masterdirect2' ? 'MASTER DIRECT SCRAPER 2' : 'MASTER DIRECT SCRAPER 1'}*\nQuery: *${cleanText(session.query, 100)}*\nVideo ${page + 1}/${results.length}\nOnly explicit 240p/480p or source-marked LOW downloads are shown. HD/high-quality options are disabled.\n\n${description}`,
    footer: `ABIX-AE • ${cleanText(item.platform || 'Video', 24)}`,
    buttons,
  }, { nativeInteractive: true, quoted: undefined });
}

function guessMime(url, contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (/^(image|video)\//.test(type)) return type;
  const ext = extOf(url);
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  };
  return map[ext] || '';
}

function extForMime(mime, url) {
  const known = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi', 'video/x-matroska': '.mkv' };
  return known[mime] || (extOf(url) ? `.${extOf(url)}` : '.bin');
}

async function sendDownloadedMedia(sock, chatId, item, requestedQuality = '') {
  const choices = Array.isArray(item?.mediaOptions) ? item.mediaOptions : [];
  const chosen = requestedQuality ? choices.find(option => option.quality === requestedQuality) : null;
  const selectedUrl = chosen?.url || (item?.mediaType === 'image' ? item.mediaUrl : '');
  const url = publicHttpUrl(selectedUrl);
  if (!url) throw new Error('This result has no direct URL for the selected low-quality variant. High-quality streams are disabled.');
  const response = await fetchPublicResponse(url, {
    headers: { Accept: 'image/*,video/*,application/octet-stream;q=0.8,*/*;q=0.5', Referer: item.url || new URL(url).origin },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    try { await response.body?.cancel(); } catch {}
    throw new Error(`Media source returned HTTP ${response.status}.`);
  }
  const mime = guessMime(response.url || url, response.headers.get('content-type'));
  if (String(item?.mediaType || '').toLowerCase() === 'video' && !mime.startsWith('video/')) { try { await response.body?.cancel(); } catch {} throw new Error('The source response was not a video file. The download was stopped.'); }
  if (mime.startsWith('video/') && !chosen) { try { await response.body?.cancel(); } catch {} throw new Error('Choose an available 240p, 480p, or LOW download button. Unclassified video links are disabled.'); }
  if (!mime) {
    try { await response.body?.cancel(); } catch {}
    throw new Error('The source did not return a direct image or video file.');
  }
  const buffer = await readLimited(response, MAX_MEDIA_DOWNLOAD_BYTES);
  if (!buffer.length) throw new Error('The source returned an empty file.');
  const baseName = cleanText(item.title || 'media', 70).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'media';
  const fileName = `${baseName}${extForMime(mime, response.url || url)}`;
  return sock.sendMessage(chatId, {
    document: buffer,
    mimetype: mime,
    fileName,
    caption: `⬇️ *Download ready*${chosen ? ` • ${chosen.quality === 'low' ? 'LOW' : chosen.quality.toUpperCase()}` : ''}\n${cleanText(item.title || 'Media file', 160)}\nSource: ${cleanText(item.url || url, 250)}`, 
    _skipForwardContext: true,
  });
}

function targetPrefix(context) {
  try {
    const settings = require('../../settings');
    return String(context?.prefix || settings.prefixes?.[0] || '-');
  } catch {
    return String(context?.prefix || '-');
  }
}

async function handleAction({ sock, chatId, message, args, context, command, callbackAlias }) {
  const action = String(args[0] || '').toLowerCase();
  if (!['__download', '__page'].includes(action)) return false;
  const senderId = context.senderId || message.key.participant || message.key.remoteJid;
  const { resolveOwner } = require('../../lib/owner');
  const authorized = Boolean((await resolveOwner(senderId, sock, chatId)).isOwner);
  if (!authorized) {
    await sock.sendMessage(chatId, { text: '🔒 Only the configured primary owner and secondary owner can use this button.', _skipForwardContext: true });
    return true;
  }
  const token = String(args[1] || '');
  const indexOrPage = Number.parseInt(args[2] || '', 10);
  const requestedQuality = String(args[3] || '').toLowerCase();
  const session = getSession(chatId, token, command);
  if (!session || !Number.isInteger(indexOrPage)) {
    await sock.sendMessage(chatId, { text: '⌛ This media button expired. Run the search again.', _skipForwardContext: true });
    return true;
  }
  if (action === '__page') {
    await renderMediaPage(sock, chatId, session, token, indexOrPage, targetPrefix(context), callbackAlias);
    return true;
  }
  const item = session.results[indexOrPage];
  if (!item) {
    await sock.sendMessage(chatId, { text: '❌ The selected media result is no longer available.', _skipForwardContext: true });
    return true;
  }
  try {
    await sendDownloadedMedia(sock, chatId, item, requestedQuality);
  } catch (error) {
    await sock.sendMessage(chatId, {
      text: `❌ Download failed: ${cleanText(error.message || 'Source unavailable', 240)}\n\nThe source may block direct downloads or exceed the ${Math.round(MAX_MEDIA_DOWNLOAD_BYTES / (1024 * 1024))} MB limit.`,
      _skipForwardContext: true,
    });
  }
  return true;
}

function makeDirectScrapeCommand({ command, aliases, label, service, outputFolder }) {
  const { resolveOwner } = require('../../lib/owner');
  const callbackAlias = Array.isArray(aliases) && aliases.length ? aliases[aliases.length - 1] : command;
  return {
    command,
    aliases,
    category: 'owner',
    ownerOnly: true,
    cooldown: 1500,
    heavy: true,
    description: `${label}: owner/secondary-owner-only media search slider with direct download buttons`,
    usage: `-${callbackAlias} <query> [--site=ID|NAME] [--list-sites] [--sites=N|--all] [--per-site=N]`,
    async handler(sock, message, args = [], context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      const senderId = context.senderId || message.key.participant || message.key.remoteJid;
      const authorized = Boolean((await resolveOwner(senderId, sock, chatId)).isOwner);
      if (!authorized) {
        return sock.sendMessage(chatId, { text: '🔒 Only the configured primary owner and secondary owner can use this command.', _skipForwardContext: true });
      }

      if (await handleAction({ sock, chatId, message, args, context, command, callbackAlias })) return;

      const scraper = new service.Scraper(path.join(__dirname, '..', '..', 'data', outputFolder));
      // Remove a legacy persistent result file before starting a new query, so
      // old versions' JSON output is not left on the server if this run fails.
      try { await fs.promises.unlink(path.join(scraper.outputDir, 'master_scraped_targets.json')); }
      catch (cleanupError) { if (cleanupError.code !== 'ENOENT') console.warn(`[${command}] Could not remove legacy result JSON: ${cleanupError.message}`); }
      const options = parseOptions(args, scraper.getTargetCount());
      if (options.listSites) {
        const targets = Array.isArray(scraper.targets) ? scraper.targets : [];
        const lines = targets.map(target => `• ${target.id} — ${target.name} (${target.type})`);
        if (!lines.length) return sock.sendMessage(chatId, { text: 'No configured site targets were found.', _skipForwardContext: true });
        await sock.sendMessage(chatId, { text: `📚 *${label} — SUPPORTED SITES*\nUse --site=ID or --site="Site Name". Searches run against one site by default.\n\n${lines.slice(0, 28).join('\n')}`, _skipForwardContext: true });
        for (let i = 28; i < lines.length; i += 28) {
          await sock.sendMessage(chatId, { text: `📚 *SUPPORTED SITES (${i + 1}-${Math.min(lines.length, i + 28)}/${lines.length})*\n${lines.slice(i, i + 28).join('\n')}`, _skipForwardContext: true });
        }
        return;
      }
      if (!options.query) {
        return sock.sendMessage(chatId, {
          text: `🔎 *${label.toUpperCase()}*\n\nUsage: ${targetPrefix(context)}${callbackAlias} <query> [--site=ID|NAME] [--list-sites] [--sites=N|--all] [--per-site=N (up to 40)]\nUse --list-sites to list all configured site IDs/names.\nExamples: ${targetPrefix(context)}${callbackAlias} anime wallpaper --site=zerochan\n${targetPrefix(context)}${callbackAlias} anime wallpaper --sites=3\n\nSearches one site by default; displays one video per message with low-only download buttons and MORE VIDEO for the next video. Use --site=ID for a specific target; use --all only when you intentionally want every target. Media slider and DOWNLOAD buttons appear only when public media previews are available.`,
          _skipForwardContext: true,
        });
      }

      const status = await sock.sendMessage(chatId, {
        text: `🔎 *${label} started*\nQuery: ${cleanText(options.query, 100)}\nTarget selection: ${options.site ? options.site : (options.all ? `ALL (${scraper.getTargetCount()})` : `first ${options.maxTargets} site(s)`)}\nUp to ${options.perSiteLimit} candidates per site; one video per message\n\nFinding low-quality video variants (240p/480p/LOW)…`,
        _skipForwardContext: true,
      });

      try {
        const rawResults = await scraper.runPipeline(options.query, {
          maxTargets: options.maxTargets,
          targetId: options.site,
          perSiteLimit: options.perSiteLimit,
          delayMs: 900,
        });
        try { if (status?.key) await sock.sendMessage(chatId, { delete: status.key }); } catch {}
        if (!rawResults.length) {
          return sock.sendMessage(chatId, {
            text: `⚠️ *No page results found.*\nQuery: ${cleanText(options.query, 100)}\nNo result JSON was written to disk. Try a different site or query.`,
            _skipForwardContext: true,
          });
        }

        const sessionResults = rawResults.slice(0, MAX_SESSION_RESULTS).map(item => ({
          ...item,
          _mediaResolved: false,
          mediaUrl: '',
          mediaType: '',
          thumbnailUrl: publicHttpUrl(item.thumbnailUrl || '') || '',
        }));
        const token = rememberSession(chatId, command, options.query, sessionResults);
        return await renderMediaPage(sock, chatId, sessions.get(chatId).get(token), token, 0, targetPrefix(context), callbackAlias);
      } catch (error) {
        console.error(`[${command}]`, error);
        try { if (status?.key) await sock.sendMessage(chatId, { delete: status.key }); } catch {}
        return sock.sendMessage(chatId, { text: `❌ ${label} failed: ${cleanText(error?.message || 'Unexpected error', 300)}`, _skipForwardContext: true });
      }
    },
  };
}

module.exports = {
  parseOptions,
  makeDirectScrapeCommand,
  publicHttpUrl,
  typeFromUrl,
  extractMediaFromHtml,
  videoOptionsFromHtml,
  readLimited,
  rememberSession,
  getSession,
  renderMediaPage,
};
