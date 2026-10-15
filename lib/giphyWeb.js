'use strict';

/**
 * ABIX GIPHY WEB CORE — Node.js 20+
 *
 * No GIPHY API key. No Python. Uses GIPHY's public web search pages and,
 * only when the bot host gets a 403/429, a text-reader fallback for the same
 * GIPHY URL. Media is always downloaded and validated before being returned.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BASE = 'https://giphy.com';
const MAX_N = 10;
const MAX_CANDIDATES = 60;
const MAX_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT = 30_000;
const MEDIA_HOSTS = ['media.giphy.com', 'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com'];
const TMP = path.join(os.tmpdir(), 'abix_giphy_tmp');

const HDR = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  Referer: `${BASE}/`,
};

const KINDS = {
  gif: {
    segment: 'gifs',
    suffix: '',
    // mp4 is required for reliable WhatsApp GIF-style video delivery.
    direct: ['giphy.mp4', '200w.mp4', '480w.mp4', '720p.mp4', 'giphy.gif', '200w.gif'],
  },
  sticker: {
    segment: 'stickers',
    suffix: '-stickers',
    direct: ['giphy.webp', '200w.webp', 'fixed_height.webp', 'fixed_width.webp', 'giphy.gif', '200w.gif', 'giphy.mp4'],
  },
  clip: {
    segment: 'clips',
    suffix: '-clips',
    direct: ['giphy.mp4', '720p.mp4', '480w.mp4', '200w.mp4', 'giphy.webm'],
  },
};

const RANDOM_WORDS = (
  'happy funny cat dog dance love wow lol cool omg hello bye yes no thanks sad angry excited ' +
  'party food cute fail win sleepy hungry celebrate clap facepalm shrug mindblown thumbs-up hi ' +
  'good-morning good-night anime meme reaction eye-roll high-five money tableflip'
).split(' ');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function clean(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u003F/gi, '?')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .trim();
}

function slug(value) {
  return encodeURIComponent(String(value || '').trim().replace(/\s+/g, '-'));
}

function searchUrl(kind, query) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`Unsupported GIPHY kind: ${kind}`);
  return `${BASE}/search/${slug(query)}${cfg.suffix}`;
}

function randomUrl(kind) {
  if (kind === 'gif') return `${BASE}/trending`;
  if (kind === 'sticker') return `${BASE}/?type=stickers`;
  if (kind === 'clip') return `${BASE}/clips`;
  throw new Error(`Unsupported GIPHY kind: ${kind}`);
}

function mediaIdFromPath(urlOrPath) {
  const text = clean(urlOrPath);
  try {
    const u = new URL(text, BASE);
    const parts = u.pathname.split('/').filter(Boolean);
    const mediaIndex = parts.findIndex((p) => p.toLowerCase() === 'media');
    if (mediaIndex >= 0 && parts[mediaIndex + 1]) {
      const after = parts[mediaIndex + 1];
      return after.startsWith('v1.') ? parts[mediaIndex + 2] || null : after;
    }
  } catch {}
  return null;
}

function extractIdFromSlug(slugValue) {
  const last = String(slugValue || '').split('-').pop();
  return /^[A-Za-z0-9]{8,}$/.test(last || '') ? last : null;
}

function addItem(out, seen, item) {
  if (!item?.id || seen.has(item.id)) return;
  seen.add(item.id);
  out.push(item);
}

function extractItems(html, kind) {
  const normalized = clean(html);
  const out = [];
  const seen = new Set();
  const wantedSegment = KINDS[kind].segment;

  // Absolute and relative GIPHY item links. One ID = one search result.
  const pageRe = /(?:(?:https?:\/\/)?(?:www\.)?giphy\.com)?\/(gifs|stickers|clips)\/([A-Za-z0-9%_-]+)/gi;
  for (const m of normalized.matchAll(pageRe)) {
    const segment = m[1].toLowerCase();
    if (segment !== wantedSegment) continue;
    const slugValue = decodeURIComponent(m[2]);
    const id = extractIdFromSlug(slugValue);
    if (!id) continue;
    addItem(out, seen, {
      id,
      slug: slugValue,
      base: `${BASE}/${segment}/${slugValue}`,
      segment,
    });
  }

  // Modern pages/readers can expose only CDN media URLs. Still dedupe by ID.
  const mediaRe = /https?:\/\/(?:media\d*\.giphy\.com|media-assets\.giphy\.com)\/media\/(?:v1\.[\w-]+\/)?([A-Za-z0-9_-]{8,})\/([^\"'<>\s)]+)/gi;
  for (const m of normalized.matchAll(mediaRe)) {
    const id = m[1];
    const file = String(m[2]).split('?')[0];
    if (!/\.(mp4|gif|webp|webm)$/i.test(file)) continue;
    addItem(out, seen, { id, slug: id, base: null, segment: wantedSegment });
  }

  return out;
}

function extractMedia(html, id) {
  const normalized = clean(html);
  const out = [];
  const seen = new Set();
  const re = /https?:\/\/(?:media\d*\.giphy\.com|media-assets\.giphy\.com)\/media\/(?:v1\.[\w-]+\/)?([A-Za-z0-9_-]{8,})\/([^\"'<>\s)]+)/gi;
  for (const m of normalized.matchAll(re)) {
    if (m[1] !== id) continue;
    const url = clean(m[0]);
    const file = String(m[2]).split('?')[0];
    const ext = file.toLowerCase().match(/\.(mp4|gif|webp|webm)$/)?.[1] || null;
    if (!ext || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, ext });
  }
  return out;
}

async function fetchHtml(url, timeout = REQUEST_TIMEOUT, headers = HDR) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`GIPHY HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSearchHtml(url) {
  try {
    return await fetchHtml(url);
  } catch (primaryError) {
    const fallbackUrls = [
      `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`,
      `https://r.jina.ai/https://${url.replace(/^https?:\/\//, '')}`,
    ];
    for (const proxyUrl of fallbackUrls) {
      try {
        const text = await fetchHtml(proxyUrl, 45_000, {
          'User-Agent': HDR['User-Agent'],
          'Accept': 'text/plain,text/html;q=0.9,*/*;q=0.8',
          'Referer': `${BASE}/`,
        });
        if (text && text.length > 100) return text;
      } catch {}
    }
    const error = new Error(`GIPHY search blocked/unavailable (HTTP ${primaryError.status || 'network'})`);
    error.status = primaryError.status;
    throw error;
  }
}

async function browserSearch(url, wanted, kind) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { return []; }
  let browser;
  const out = [];
  const seen = new Set();
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: HDR['User-Agent'],
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2200);
    for (let i = 0; i < 40 && out.length < wanted; i += 1) {
      for (const item of extractItems(await page.content(), kind)) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          out.push(item);
        }
      }
      if (out.length >= wanted) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.mouse.wheel(0, 2600);
      await page.waitForTimeout(700);
    }
  } catch (error) {
    console.warn('[giphy] browser fallback failed:', error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return out;
}

function directUrls(item, kind) {
  const cfg = KINDS[kind];
  const urls = [];
  const seen = new Set();
  for (const host of MEDIA_HOSTS) {
    for (const name of cfg.direct) {
      const url = `https://${host}/media/${item.id}/${name}`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  // i.giphy.com is a useful GIF-only fallback for legacy media.
  if (kind === 'gif') urls.push(`https://i.giphy.com/${item.id}.gif`);
  return [...new Set(urls)];
}

function magicType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF89a' || buffer.subarray(0, 6).toString('ascii') === 'GIF87a') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buffer.subarray(0, 4).toString('ascii') === '\x1a\x45\xdf\xa3') return 'webm';
  // ISO BMFF / MP4: an 'ftyp' box should exist near the start.
  const head = buffer.subarray(0, Math.min(buffer.length, 128)).toString('ascii');
  if (head.includes('ftyp')) return 'mp4';
  return null;
}

async function downloadBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      headers: { ...HDR, Accept: 'video/mp4,video/webm,image/gif,image/webp,image/*;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`media HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) throw new Error('media too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('empty media');
    if (buffer.length > MAX_BYTES) throw new Error('media too large');

    const type = magicType(buffer);
    const declared = contentType.split(';')[0];
    const declaredOk = /^(video\/|image\/(gif|webp)|application\/octet-stream$)/.test(declared || '');
    if (!declaredOk && !type) throw new Error(`unexpected content-type ${declared || 'unknown'}`);
    if (!type) throw new Error('unrecognized media bytes');

    return { buffer, contentType: contentType || null, type, url };
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePageMedia(item) {
  const pages = item.base ? [item.base] : [];
  if (item.slug && item.slug !== item.id) {
    pages.push(`${BASE}/${item.segment || 'gifs'}/${item.slug}`);
  }
  const out = [];
  const seen = new Set();
  for (const page of [...new Set(pages)]) {
    try {
      const html = await fetchHtml(page, 20_000);
      for (const media of extractMedia(html, item.id)) {
        if (!seen.has(media.url)) {
          seen.add(media.url);
          out.push(media);
        }
      }
      if (out.length >= 12) break;
    } catch {}
  }
  return out;
}

async function downloadItemMedia(kind, item) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`Unsupported GIPHY kind: ${kind}`);
  const candidates = directUrls(item, kind);
  let pageMedia = [];
  const tried = new Set();

  async function tryUrls(urls) {
    for (const url of urls) {
      if (tried.has(url)) continue;
      tried.add(url);
      try {
        const result = await downloadBuffer(url);
        // GIF command must end up with MP4 for WhatsApp gifPlayback. Raw GIFs
        // can be converted later if needed, but are not returned as-is.
        if (kind === 'gif' && result.type === 'webm') continue;
        if (kind === 'gif' && result.type === 'webp') continue;
        if (kind === 'clip' && !['mp4', 'webm'].includes(result.type)) continue;
        return result;
      } catch (error) {
        // Continue: one dead rendition must never consume the user's count.
        if (tried.size <= 12) console.warn(`[giphy] ${kind} ${item.id} rendition skipped: ${error.message}`);
      }
    }
    return null;
  }

  const direct = await tryUrls(candidates);
  if (direct && (kind !== 'gif' || direct.type === 'mp4')) return direct;

  pageMedia = await resolvePageMedia(item);
  const pageCandidates = pageMedia
    .filter((x) => {
      if (kind === 'gif') return x.ext === 'mp4' || x.ext === 'gif';
      if (kind === 'sticker') return ['webp', 'gif', 'mp4'].includes(x.ext);
      return ['mp4', 'webm'].includes(x.ext);
    })
    .map((x) => x.url);
  const pageResult = await tryUrls(pageCandidates);
  if (pageResult && (kind !== 'gif' || pageResult.type === 'mp4')) return pageResult;

  // GIF-only fallback for -gif. The caller converts it to MP4 with ffmpeg.
  if (kind === 'gif') {
    const gifUrls = [...candidates, ...pageCandidates].filter((u) => /\.(gif)(?:\?|$)/i.test(u));
    for (const url of gifUrls) {
      if (tried.has(url)) continue;
      tried.add(url);
      try {
        const result = await downloadBuffer(url);
        if (result.type === 'gif') return result;
      } catch {}
    }
  }

  return null;
}

async function searchWeb(kind, query, count = 1, options = {}) {
  const requested = Math.max(1, Math.min(Number(count) || 1, Number(options.maxCount || MAX_N)));
  const candidateTarget = Math.max(requested * 8, 24);
  let q = String(query || '').trim();
  const random = Boolean(options.random || !q || q.toLowerCase() === 'random');
  if (random && !q) q = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)].replace(/-/g, ' ');

  const url = random && options.trending !== false ? randomUrl(kind) : searchUrl(kind, q);
  let html;
  try {
    html = await fetchSearchHtml(url);
  } catch (error) {
    // Optional Playwright is the final fallback. It is never required for the
    // normal path and, importantly, never invokes Python.
    const browser = await browserSearch(url, candidateTarget, kind);
    if (browser.length) return browser.slice(0, Math.min(browser.length, MAX_CANDIDATES));
    throw error;
  }

  let items = extractItems(html, kind);
  if (items.length < candidateTarget) {
    const browser = await browserSearch(url, candidateTarget, kind);
    const ids = new Set(items.map((x) => x.id));
    for (const item of browser) if (!ids.has(item.id)) {
      ids.add(item.id);
      items.push(item);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= Math.max(candidateTarget, 40)) break;
  }

  if (!unique.length) throw new Error(`No GIPHY ${KINDS[kind].segment} results found`);
  if (random) unique.sort(() => Math.random() - 0.5);
  return unique.slice(0, MAX_CANDIDATES);
}

const { getFfmpegPath } = require('./ffmpegPath');

function resolveFfmpeg() {
  return getFfmpegPath();
}

function convertGifToMp4(gifBuffer) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) return Promise.reject(new Error('ffmpeg is not installed on this host; GIF result skipped'));
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'gif-'));
  const input = path.join(dir, 'input.gif');
  const output = path.join(dir, 'output.mp4');
  fs.writeFileSync(input, gifBuffer);
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, [
      '-y', '-i', input,
      '-t', '8', '-vf', 'fps=15,scale=480:-2:flags=lanczos',
      '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-crf', '26', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    const finish = (fn, value) => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      fn(value);
    };
    p.on('error', (error) => finish(reject, error));
    p.on('close', (code) => {
      if (code !== 0) return finish(reject, new Error(`ffmpeg exit ${code}${stderr ? `: ${stderr.slice(-220)}` : ''}`));
      try {
        const buffer = fs.readFileSync(output);
        const type = magicType(buffer);
        if (type !== 'mp4' || !buffer.length) throw new Error('ffmpeg produced invalid MP4');
        if (buffer.length > MAX_BYTES) throw new Error('converted MP4 is too large');
        finish(resolve, buffer);
      } catch (error) {
        finish(reject, error);
      }
    });
  });
}

module.exports = {
  searchWeb,
  downloadBuffer,
  downloadItemMedia,
  convertGifToMp4,
  sleep,
  magicType,
  MAX_N,
};
