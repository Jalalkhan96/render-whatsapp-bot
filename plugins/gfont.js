'use strict';

/**
 * myBOT Google Fonts API downloader
 *
 * Required .env:
 *   GOOGLE_FONTS_API_KEY=your_google_fonts_webfonts_api_key
 *
 * Commands:
 *   -gfont <name>
 *   -gfont <name> <variant>
 *   -gfont search <name>
 *   -gfont info <name>
 *   -gfont styles <name>
 *
 * Uses the Google Fonts Developer API (webfonts.list) for catalog metadata
 * and the file URL returned by the API for the actual font download.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = path.resolve(process.cwd());
const TEMP_DIR = path.join(ROOT, 'tmp', 'gfonts');
const API_KEY = String(process.env.GOOGLE_FONTS_API_KEY || '').trim();
const API_URL = 'https://www.googleapis.com/webfonts/v1/webfonts';
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT = 25_000;
const CACHE_MS = 10 * 60 * 1000;
const cache = { at: 0, items: null };

function clean(v, fallback = '') {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || fallback;
}

function safeName(v) {
  return clean(v, 'font').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 100);
}

function reply(sock, message, context, text) {
  return sock.sendMessage(context.chatId || message.key.remoteJid, { text }, { quoted: message });
}

function ensureTemp() { fs.mkdirSync(TEMP_DIR, { recursive: true }); }

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p.endsWith('.woff2')) return 'woff2';
    if (p.endsWith('.woff')) return 'woff';
    if (p.endsWith('.ttf')) return 'ttf';
    if (p.endsWith('.otf')) return 'otf';
  } catch {}
  return 'bin';
}

function mime(ext) {
  return ({
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
    bin: 'application/octet-stream',
  })[ext] || 'application/octet-stream';
}

async function getCatalog() {
  if (!API_KEY) throw new Error('GOOGLE_FONTS_API_KEY is not configured.');
  if (cache.items && Date.now() - cache.at < CACHE_MS) return cache.items;
  const response = await axios.get(API_URL, {
    params: { key: API_KEY, sort: 'alpha' },
    timeout: REQUEST_TIMEOUT,
    validateStatus: s => s >= 200 && s < 300,
  });
  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  cache.items = items;
  cache.at = Date.now();
  return items;
}

function findFonts(items, query) {
  const q = clean(query).toLowerCase();
  if (!q) return [];
  return items
    .map(f => ({ f, exact: String(f.family || '').toLowerCase() === q, starts: String(f.family || '').toLowerCase().startsWith(q) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.starts) - Number(a.starts) || String(a.f.family).localeCompare(String(b.f.family)))
    .map(x => x.f);
}

function chooseVariant(font, requested) {
  const variants = Array.isArray(font.variants) ? font.variants : [];
  if (!variants.length) return null;
  if (!requested) return variants.includes('regular') ? 'regular' : variants[0];
  const raw = requested.toLowerCase().trim();
  const aliases = { normal: 'regular', regular: 'regular', italic: 'italic', bold: '700', semibold: '600', medium: '500', light: '300', black: '900' };
  const v = aliases[raw] || raw;
  return variants.includes(v) ? v : null;
}

async function downloadFont(font, variant) {
  const url = font?.files?.[variant];
  if (!url) throw new Error(`No downloadable file was returned for variant ${variant}.`);
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Google returned an invalid font file URL.'); }
  if (!['https:'].includes(parsed.protocol) || !['fonts.gstatic.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('Google returned an unexpected download host.');
  }

  ensureTemp();
  const ext = extFromUrl(url);
  const fileName = `${safeName(font.family)}-${safeName(variant)}.${ext}`;
  const filePath = path.join(TEMP_DIR, `${Date.now()}-${fileName}`);
  const response = await axios.get(url, {
    responseType: 'stream', timeout: REQUEST_TIMEOUT, maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 300,
    headers: { 'User-Agent': 'myBOT-GoogleFont/1.0', Accept: '*/*' },
  });
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
    response.data.destroy();
    throw new Error('Font file exceeds the 25 MB limit.');
  }
  let received = 0;
  const out = fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 });
  try {
    await new Promise((resolve, reject) => {
      response.data.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) response.data.destroy(new Error('Font file exceeds the 25 MB limit.'));
      });
      response.data.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      response.data.pipe(out);
    });
  } catch (e) {
    try { out.destroy(); } catch {}
    try { fs.rmSync(filePath, { force: true }); } catch {}
    throw e;
  }
  return { filePath, fileName, ext, bytes: received };
}

function cleanup(file) { try { if (file) fs.rmSync(file, { force: true }); } catch {} }

function menu(prefix) {
  return [
    '╭━━━〔 GOOGLE FONT API 〕━━━╮',
    '┃',
    `┃ ${prefix}gfont <name>`,
    `┃ ${prefix}gfont <name> <variant>`,
    `┃ ${prefix}gfont search <name>`,
    `┃ ${prefix}gfont info <name>`,
    `┃ ${prefix}gfont styles <name>`,
    '┃',
    '┃ Variants: regular, italic, 300, 400, 500, 600, 700, 900',
    '┃',
    '┃ Examples:',
    `┃ ${prefix}gfont Roboto`,
    `┃ ${prefix}gfont Tangerine`,
    `┃ ${prefix}gfont Roboto 700`,
    `┃ ${prefix}gfont search arabic`,
    '┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

async function handler(sock, message, args, context = {}) {
  const prefix = context.prefix || '-';
  const sub = clean(args?.[0]);
  if (!sub || /^(menu|help)$/i.test(sub)) return reply(sock, message, context, menu(prefix));
  if (!API_KEY) return reply(sock, message, context, '❌ Google Fonts API is not configured. Add GOOGLE_FONTS_API_KEY to .env and restart the bot.');

  try {
    const catalog = await getCatalog();
    if (/^search$/i.test(sub)) {
      const q = clean(args.slice(1).join(' '));
      if (!q) return reply(sock, message, context, `Usage: ${prefix}gfont search <name>`);
      const results = findFonts(catalog, q).slice(0, 10);
      if (!results.length) return reply(sock, message, context, `❌ No Google Fonts found for *${q}*.`);
      return reply(sock, message, context, `🔎 *Google Fonts Search: ${q}*\n\n${results.map((f, i) => `${i + 1}. *${f.family}* — ${(f.variants || []).join(', ')}`).join('\n')}`);
    }

    const query = /^((info|styles))$/i.test(sub) ? clean(args.slice(1).join(' ')) : args.slice(0, -1).join(' ');
    const requestedVariant = /^((info|styles))$/i.test(sub) ? '' : (args.length > 1 ? args[args.length - 1] : '');
    const targetName = /^((info|styles))$/i.test(sub) ? query : clean(args.join(' ')).replace(/\s+(regular|italic|light|medium|semibold|bold|black|[1-9]00)$/i, '');
    const matches = findFonts(catalog, targetName);
    const font = matches[0];
    if (!font) return reply(sock, message, context, `❌ Google Font *${targetName}* was not found.`);

    if (/^info$/i.test(sub)) {
      return reply(sock, message, context, `ℹ️ *${font.family}*\n\nVariants: ${(font.variants || []).join(', ')}\nSubsets: ${(font.subsets || []).join(', ')}\nCategory: ${font.category || 'N/A'}\nVersion: ${font.version || 'N/A'}`);
    }
    if (/^styles$/i.test(sub)) {
      return reply(sock, message, context, `🎨 *${font.family} styles*\n\n${(font.variants || []).join('\n')}`);
    }

    const variant = chooseVariant(font, requestedVariant);
    if (!variant) return reply(sock, message, context, `❌ Variant *${requestedVariant}* is not available.\nAvailable: ${(font.variants || []).join(', ')}`);
    await reply(sock, message, context, `⏬ Downloading Google Font *${font.family}* (${variant})...`);
    let downloaded;
    try {
      downloaded = await downloadFont(font, variant);
      const buffer = fs.readFileSync(downloaded.filePath);
      await sock.sendMessage(context.chatId || message.key.remoteJid, {
        document: buffer,
        mimetype: mime(downloaded.ext),
        fileName: downloaded.fileName,
        caption: `✅ *${font.family}*\nVariant: ${variant}\nSource: Google Fonts Developer API`,
      }, { quoted: message });
    } finally { cleanup(downloaded?.filePath); }
  } catch (error) {
    return reply(sock, message, context, `❌ Google Font request failed: ${error.message}`);
  }
}

module.exports = {
  command: 'gfont',
  aliases: ['googlefont', 'googlefonts'],
  category: 'download',
  description: 'Download Google Fonts through the Google Fonts Developer API.',
  usage: '-gfont <name> [variant] | -gfont search <name> | -gfont info <name> | -gfont styles <name>',
  handler,
};
