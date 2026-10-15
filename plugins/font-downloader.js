'use strict';

/**
 * ABIX Font Studio. All normal font searches read the existing Turso catalog.
 * A result with a saved download_url is downloaded and sent as a WhatsApp document;
 * URLs are never printed as a substitute for the actual file.
 */
const db = require('../lib/fontCatalogDb');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const MAX_RESULTS = 10;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 35000;

function reply(sock, message, context, text) {
  const jid = context?.chatId || message?.key?.remoteJid;
  if (!jid) return Promise.resolve();
  return sock.sendMessage(jid, { text: String(text).slice(0, 6500) }, { quoted: message });
}
function safe(value, fallback = 'N/A', max = 160) {
  return db.clean(value, fallback).replace(/[*_~`]/g, '').slice(0, max);
}
function safeFileName(value, fallback = 'font') {
  return db.clean(value, fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 100) || fallback;
}
function menu(prefix) {
  const p = prefix || '-';
  return [
    '🔤 *ABIX FONT STUDIO* 🔤',
    '_Search • Download • Discover_',
    '_365K+ fonts • all connected sources_',
    '',
    '> 💡 _Tip: command copy karke send karo!_',
    '',
    '*⚡ QUICK SEARCH*',
    `\`${p}font horror\` → _Up to 10 matching font files_`,
    `\`${p}font dl horror\` → _Download one matching font_`,
    `\`${p}font info horror\` → _Find and send one font file_`,
    `\`${p}font random\` → 🎲 _10 random font files_`,
    '',
    '*🇵🇰 URDU FONTS*',
    `\`${p}font urdu\` → _10 Urdu/Nastaliq font files_`,
    `\`${p}font urdu random\` → _10 random Urdu fonts_`,
    `\`${p}font urdu jameel\` → _Search Urdu fonts by name_`,
    `\`${p}font lang arabic\` → _Search by language_`,
    '',
    '*🎛️ FILTERS*',
    `\`${p}font type serif\` → _Filter by category_`,
    `\`${p}font license free\` → _Filter by saved license label_`,
    `\`${p}font types\` → _Browse available categories_`,
    '',
    '*🌐 SEARCH ONE SOURCE*',
    `\`${p}dafont horror\` → _DaFont_`,
    `\`${p}gfonts horror\` → _Google Fonts_`,
    `\`${p}fontshare horror\` → _Fontshare_`,
    `\`${p}urbanfonts horror\` → _UrbanFonts_`,
    `\`${p}fontspace horror\` → _FontSpace_`,
    `\`${p}freefonts horror\` → _1001 Free Fonts_`,
    `\`${p}wfonts horror\` → _WFonts_`,
    `\`${p}abstractfonts horror\` → _Abstract Fonts_`,
    `\`${p}fontsquirrel horror\` → _Font Squirrel_`,
    `\`${p}fontwebsearch horror\` → _Live DaFont web search_`,
    '',
    '*🔁 PICK FROM RECENT RESULTS*',
    `\`${p}fd 1\` → _Send result #1 again_`,
    `\`${p}fd 1,3,5\` → _Send selected files_`,
    `\`${p}fd all\` → _Send all recent results_`,
    '',
    '*📊 MORE*',
    `\`${p}font stats\` → _Database totals and saved URLs_`,
    `\`${p}font sites\` → _List connected font sources_`,
    '',
    '📁 *DIRECT FILE DELIVERY*',
    '_The bot sends real attachments when a source URL is downloadable._',
    '_Restricted, broken, or webpage-only URLs may fail; links are not used as fake attachments._',
  ].join('\n');
}

function render(row, index = 1) {
  const item = db.displayRow(row, index);
  return `${item.index}. ${safe(item.name, 'Unnamed font', 120)} (ID: ${item.id})\n${safe(item.source)} · ${safe(item.category, 'Uncategorized', 60)}\nLicense: ${safe(item.license, 'Not specified', 80)} · Author: ${safe(item.author, 'Unknown', 80)}`;
}
function queryHint(prefix, args) { return `Usage: ${prefix}font ${args}`; }
function getRowDownloadUrl(row) { return db.safeUrl(row?.download_url || row?.downloadUrl || row?.download || ''); }
function getRowName(row) { return safe(row?.name || row?.family || 'Font', 'Font', 120); }
function getRowSource(row) { return safe(db.sourceLabel(row?.source || 'Live web search'), 'Font source'); }
function getRowLicense(row) { return safe(row?.license || 'Not specified', 'Not specified', 100); }

function detectFileType(head, contentType = '') {
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (head.length >= 4) {
    if (head[0] === 0x50 && head[1] === 0x4b && [0x03, 0x05, 0x07].includes(head[2])) return { ext: '.zip', mime: 'application/zip' };
    if (head.subarray(0, 4).toString('ascii') === 'wOF2') return { ext: '.woff2', mime: 'font/woff2' };
    if (head.subarray(0, 4).toString('ascii') === 'wOFF') return { ext: '.woff', mime: 'font/woff' };
    if (head.subarray(0, 4).toString('ascii') === 'OTTO') return { ext: '.otf', mime: 'font/otf' };
    if (head.subarray(0, 4).toString('ascii') === 'ttcf') return { ext: '.ttc', mime: 'font/collection' };
    if (head.subarray(0, 4).toString('ascii') === 'true' || head.subarray(0, 4).toString('ascii') === 'typ1' || (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00)) return { ext: '.ttf', mime: 'font/ttf' };
    if (head.subarray(0, 4).toString('ascii') === 'Rar!') return { ext: '.rar', mime: 'application/vnd.rar' };
    if (head.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return { ext: '.7z', mime: 'application/x-7z-compressed' };
  }
  const textStart = head.subarray(0, 200).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (textStart.startsWith('<!doctype html') || textStart.startsWith('<html') || textStart.startsWith('{"error"') || textStart.startsWith('{"message"')) {
    throw new Error('saved URL returned a web page, not a font file');
  }
  if (/^(text\/html|application\/json|text\/plain)$/.test(mime)) throw new Error('saved URL returned text, not a font file');
  return null;
}

function assertSafeRemoteUrl(raw) {
  const safeUrl = db.safeUrl(raw);
  if (!safeUrl) throw new Error('the saved download URL is invalid');
  const u = new URL(safeUrl);
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error('private network URLs are not allowed');
  }
  return safeUrl;
}

async function downloadFontFile(rawUrl, fontName, options = {}) {
  const url = assertSafeRemoteUrl(rawUrl);
  const referer = db.safeUrl(options.referer || '') || new URL(url).origin + '/';
  const tempPath = path.join(os.tmpdir(), `abix-font-${process.pid}-${crypto.randomBytes(8).toString('hex')}.part`);
  let stream;
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: MAX_FILE_BYTES,
      maxBodyLength: MAX_FILE_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: referer,
        Accept: 'application/octet-stream, application/zip, font/woff2, font/woff, font/ttf, font/otf, */*',
      },
      validateStatus: status => status >= 200 && status < 300,
    });
    stream = response.data;
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const headerLength = Number(response.headers?.['content-length'] || 0);
    if (headerLength > MAX_FILE_BYTES) throw new Error(`file exceeds ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit`);
    if (/text\/html|application\/json/.test(contentType)) throw new Error('saved URL returned a web page, not a file');

    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_FILE_BYTES) return callback(new Error(`file exceeds ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit`));
        callback(null, chunk);
      },
    });
    await pipeline(stream, limiter, fs.createWriteStream(tempPath, { flags: 'wx' }));
    const handle = await fsp.open(tempPath, 'r');
    const head = Buffer.alloc(32);
    let read;
    try { ({ bytesRead: read } = await handle.read(head, 0, head.length, 0)); }
    finally { await handle.close(); }
    const type = detectFileType(head.subarray(0, read), contentType);
    if (!type) throw new Error('saved URL did not return a recognised ZIP/font file');
    return { tempPath, fileName: `${safeFileName(fontName)}${type.ext}`, mimetype: type.mime, size: bytes };
  } catch (error) {
    if (stream && typeof stream.destroy === 'function' && !stream.destroyed) stream.destroy();
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Some imported catalog rows store a landing page instead of a binary URL.
 * On a normal public page, look for an explicit download/file link and retry
 * with that page as Referer. This does not solve captchas, login walls or 403s.
 */
async function downloadFontFileForRow(row, fontName) {
  const savedUrl = getRowDownloadUrl(row);
  let firstError;
  try {
    return await downloadFontFile(savedUrl, fontName, { referer: row?.url });
  } catch (error) {
    firstError = error;
  }

  const pageUrl = db.safeUrl(row?.url || '');
  if (!pageUrl || !/web page|text|recognised ZIP\/font file|403|status code 403/i.test(String(firstError?.message || ''))) {
    throw firstError;
  }

  let html;
  try {
    const response = await axios.get(pageUrl, {
      responseType: 'text', timeout: 15000, maxRedirects: 4,
      maxContentLength: 2 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: new URL(pageUrl).origin + '/',
        Accept: 'text/html,application/xhtml+xml',
      },
      validateStatus: status => status >= 200 && status < 300,
    });
    html = String(response.data || '');
  } catch {
    throw firstError;
  }

  const candidates = [];
  const seen = new Set();
  const hrefRe = /href\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(hrefRe)) {
    const rawHref = String(match[2] || '').replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').trim();
    if (!rawHref || /^(?:javascript:|mailto:|#)/i.test(rawHref)) continue;
    if (!/(?:download|\/dl(?:\/|\?|$)|\.zip(?:\?|$)|\.ttf(?:\?|$)|\.otf(?:\?|$)|\.woff2?(?:\?|$)|fontfile|font-file)/i.test(rawHref)) continue;
    let candidate;
    try { candidate = assertSafeRemoteUrl(new URL(rawHref, pageUrl).toString()); } catch { continue; }
    if (seen.has(candidate) || candidate === savedUrl || candidate === pageUrl) continue;
    seen.add(candidate);
    candidates.push(candidate);
    if (candidates.length >= 4) break;
  }
  for (const candidate of candidates) {
    try { return await downloadFontFile(candidate, fontName, { referer: pageUrl }); }
    catch (error) { firstError = error; }
  }
  throw firstError;
}

/** Shared direct-file sender used by -font, -fd, source-specific catalog commands and web search. */
async function deliverFontRows(sock, message, context = {}, rows, options = {}) {
  const jid = context?.chatId || message?.key?.remoteJid;
  if (!jid) return;
  const items = Array.isArray(rows) ? rows.slice(0, Math.min(Number(options.maxFiles) || MAX_RESULTS, MAX_RESULTS)) : [];
  if (!items.length) return reply(sock, message, context, options.emptyText || '❌ No downloadable fonts were found in the selected results.');
  const downloadable = items.filter(row => getRowDownloadUrl(row));
  if (!downloadable.length) return reply(sock, message, context, '❌ These database rows do not contain a saved download URL. No links were sent. Try another search or use -fontwebsearch <name>.');

  db.rememberSelection(message, context, downloadable);
  const title = safe(options.title || 'FONT FILES', 'FONT FILES', 180);
  // Plain-text progress is intentionally omitted: WhatsApp's markdown renderer was showing unwanted italics.
  // Send the actual file attachments first, then one concise plain-text result summary.
  let sent = 0;
  const failures = [];
  for (let i = 0; i < downloadable.length; i++) {
    const row = downloadable[i];
    const name = getRowName(row);
    let file;
    let buffer;
    try {
      file = await downloadFontFileForRow(row, name);
      buffer = await fsp.readFile(file.tempPath);
      await sock.sendMessage(jid, {
        document: buffer,
        mimetype: file.mimetype,
        fileName: file.fileName,
        caption: `🔤 ${name}\nSource: ${getRowSource(row)}\nLicense: ${getRowLicense(row)}\n${row.author ? `Author: ${safe(row.author, 'Unknown', 100)}\n` : ''}File ${i + 1}/${downloadable.length}`,
      });
      sent++;
    } catch (error) {
      // Keep details in server logs for debugging; do not spam the WhatsApp chat with raw HTTP errors.
      console.warn(`[FONT DOWNLOAD] ${name}: ${error?.message || error}`);
      failures.push({ name, reason: String(error?.message || 'download failed').slice(0, 100) });
    } finally {
      buffer = null;
      if (file?.tempPath) await fsp.rm(file.tempPath, { force: true }).catch(() => {});
    }
  }
  if (failures.length) {
    await reply(sock, message, context, `Font files sent: ${sent}/${downloadable.length}.\n${failures.length} file(s) could not be downloaded because the source returned an invalid file or denied the request.\nTry again later or use -fontwebsearch <name> for a fresh source search.`);
  } else {
    await reply(sock, message, context, `Font files sent: ${sent}.`);
  }
}

async function sendResults(sock, message, context, title, result, queryLabel = '') {
  if (!result.rows.length) return reply(sock, message, context, `🔎 No downloadable fonts found${queryLabel ? ` for *${safe(queryLabel, '', 100)}*` : ''}. Try a shorter query or use ${context?.prefix || '-'}font sites.`);
  const label = `${title}${queryLabel ? ` · ${queryLabel}` : ''} · ${result.total.toLocaleString()} database match(es)`;
  return deliverFontRows(sock, message, context, result.rows, { title: label, maxFiles: MAX_RESULTS });
}

async function getByNameOrId(input, filters = {}) {
  const text = db.clean(input);
  if (/^#?\d+$/.test(text)) return db.getFontById(Number(text.replace(/^#/, '')));
  return db.getFontByName(text, filters);
}
async function sendInfo(sock, message, args, context, title = 'FONT DOWNLOAD') {
  const name = db.clean(args.join(' '));
  const prefix = context?.prefix || '-';
  if (!name) return reply(sock, message, context, queryHint(prefix, 'info <font name|id>'));
  try {
    const row = await getByNameOrId(name, { downloadableOnly: true });
    if (!row) return reply(sock, message, context, `❌ No downloadable font found for *${safe(name, '', 100)}*. Try ${prefix}font search ${safe(name, '', 100)} or ${prefix}fontwebsearch ${safe(name, '', 100)}.`);
    return deliverFontRows(sock, message, context, [row], { title: `${title}: ${row.name}`, maxFiles: 1 });
  } catch (error) { return reply(sock, message, context, db.errorMessage(error)); }
}
async function downloadSelectedFonts(sock, message, context = {}, selection) {
  const chosenText = String(selection ?? '').trim().toLowerCase();
  const results = db.getSelection(message, context);
  const prefix = context?.prefix || '-';
  if (!results.length) return reply(sock, message, context, `❌ No recent font results. Run ${prefix}font <name> or ${prefix}font random first.`);
  let chosen;
  if (chosenText === 'all') chosen = results;
  else {
    const parts = chosenText.split(',').map(v => v.trim());
    if (!parts.length || parts.some(v => !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > results.length)) {
      return reply(sock, message, context, `❌ Invalid selection. Choose 1-${results.length}, e.g. ${prefix}fd 1,3,5.`);
    }
    chosen = [...new Set(parts.map(v => results[Number(v) - 1]))];
  }
  return deliverFontRows(sock, message, context, chosen, { title: `SELECTED FONTS (${chosen.length})`, maxFiles: MAX_RESULTS });
}

async function handleCommand(sock, message, args = [], context = {}) {
  const prefix = context?.prefix || '-';
  const sub = db.clean(args?.[0]).toLowerCase();
  const rest = Array.isArray(args) ? args.slice(1) : [];
  if (!sub || ['menu', 'help'].includes(sub)) return reply(sock, message, context, menu(prefix));
  if (sub === 'fd') return downloadSelectedFonts(sock, message, context, rest.join(' '));

  try {
    if (['sites', 'sources', 'websites'].includes(sub)) {
      const lines = db.SOURCES.map(s => `• ${s.label}: ${prefix}${s.shortCommand || s.command} <query>${s.shortCommand ? ` (legacy: ${prefix}${s.command})` : ''}`);
      return reply(sock, message, context, `🌐 *FONT COLLECTION SOURCES*\n\n${lines.join('\n')}\n\nCombined: ${prefix}font <name>\nLive scrape: ${prefix}fontwebsearch <name>\nStats: ${prefix}font stats`);
    }
    if (['stats', 'count', 'counts'].includes(sub)) {
      const stats = await db.getStats();
      const sourceLines = stats.sources.slice(0, 15).map(s => `• ${safe(s.source, '', 50)}: ${s.total.toLocaleString()} (${s.downloadable.toLocaleString()} with saved file URL)`);
      return reply(sock, message, context, `📊 *FONT DATABASE STATS*\n\nTotal fonts: *${stats.total.toLocaleString()}*\nSaved download URLs: *${stats.downloadable.toLocaleString()}*\nMissing URLs: *${Math.max(0, stats.total - stats.downloadable).toLocaleString()}*\n\n${sourceLines.join('\n')}`);
    }
    if (['get', 'download', 'dl'].includes(sub)) return sendInfo(sock, message, rest, context, 'FONT DOWNLOAD');
    if (sub === 'info') return sendInfo(sock, message, rest, context, 'FONT INFO / DOWNLOAD');
    if (['types', 'themes', 'categories'].includes(sub)) {
      const types = await db.getTypes(50);
      if (!types.length) return reply(sock, message, context, 'No font categories are stored in the database yet.');
      return reply(sock, message, context, `🗂️ *FONT TYPES / CATEGORIES*\n\n${types.map(x => `• ${safe(x.category, '', 80)} — ${Number(x.total || 0).toLocaleString()}`).join('\n')}\n\nUse ${prefix}font type <category>.`);
    }
    if (sub === 'random') {
      const option = db.clean(rest.join(' '));
      const source = option ? db.sourceByName(option) : null;
      const filters = { downloadableOnly: true, random: true, limit: MAX_RESULTS };
      if (source) filters.source = source;
      else if (option) filters.language = option;
      const result = await db.queryFonts(filters);
      return sendResults(sock, message, context, '🎲 RANDOM FONTS FROM THE DATABASE', result, option || 'all sources');
    }
    if (sub === 'search' || sub === 'find') {
      const query = db.clean(rest.join(' '));
      if (!query) return reply(sock, message, context, queryHint(prefix, 'search <name>'));
      const result = await db.queryFonts({ query, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, '🔎 FONT SEARCH — ALL SOURCES', result, query);
    }
    if (sub === 'type' || sub === 'category' || sub === 'theme') {
      const type = db.clean(rest.join(' '));
      if (!type) return reply(sock, message, context, queryHint(prefix, 'type <type/category>'));
      const result = await db.queryFonts({ category: type, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, `📂 FONT TYPE: ${type}`, result, type);
    }
    if (sub === 'lang' || sub === 'language') {
      const language = db.clean(rest.join(' '));
      if (!language) return reply(sock, message, context, queryHint(prefix, 'lang <language>'));
      const result = await db.queryFonts({ language, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, `🌐 ${language.toUpperCase()} FONTS`, result, language);
    }
    if (sub === 'urdu') {
      const requested = db.clean(rest.join(' '));
      const filters = { urduOnly: true, downloadableOnly: true, limit: MAX_RESULTS };
      if (/^random$/i.test(requested)) filters.random = true;
      else if (requested && !/^(list|menu|help)$/i.test(requested)) filters.query = requested;
      const result = await db.queryFonts(filters);
      const heading = /^random$/i.test(requested) ? '🇵🇰 RANDOM URDU / NASTALIQ FONTS' : requested ? '🇵🇰 URDU FONT SEARCH' : '🇵🇰 URDU / NASTALIQ FONT COLLECTION';
      return sendResults(sock, message, context, heading, result, requested && !/^random$/i.test(requested) ? requested : 'Urdu');
    }
    if (sub === 'arabic') {
      const result = await db.queryFonts({ language: 'arabic', downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, '🌐 ARABIC / ARABIC-SCRIPT FONTS', result, 'Arabic');
    }
    if (sub === 'license' || sub === 'free') {
      const license = db.clean(rest.join(' '), sub === 'free' ? 'free' : '');
      if (!license) return reply(sock, message, context, queryHint(prefix, 'license <free|personal|pd|donation|demo>'));
      const key = license.toLowerCase().replace(/[^a-z]+/g, '');
      if (!db.LICENSE_TERMS[key]) return reply(sock, message, context, `❌ Unknown license filter. Use ${prefix}font license free|personal|pd|donation|demo.`);
      const result = await db.queryFonts({ license: key, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, `⚖️ LICENSE: ${license.toUpperCase()}`, result, license);
    }
    if (sub === 'source' || sub === 'site') {
      const source = db.sourceByName(rest[0]);
      const query = db.clean(rest.slice(1).join(' '));
      if (!source) return reply(sock, message, context, `Usage: ${prefix}font source <site> <query>\nRun ${prefix}font sites for source names.`);
      if (!query) return reply(sock, message, context, `Usage: ${prefix}font source ${source.key} <query>`);
      const result = await db.queryFonts({ source, query, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, `${source.label.toUpperCase()} FONTS`, result, query);
    }
    const query = db.clean(args.join(' '));
    if (query) {
      const result = await db.queryFonts({ query, downloadableOnly: true, limit: MAX_RESULTS });
      return sendResults(sock, message, context, '🔎 FONT SEARCH — ALL SOURCES', result, query);
    }
    return reply(sock, message, context, menu(prefix));
  } catch (error) {
    return reply(sock, message, context, db.errorMessage(error));
  }
}

module.exports = {
  command: 'font',
  aliases: ['fonts', 'fontmenu', 'fontdl', 'fonturdu', 'fontlanguage', 'fontname', 'fontrandom'],
  category: 'utility',
  description: 'Search the Turso font catalog and send actual saved font files to WhatsApp.',
  usage: '-font random | -font <name> | -font urdu | -font dl <name|id>',
  handler: async (sock, message, args = [], context = {}) => {
    const invoked = String(context?.rawText || context?.messageText || '').trim().toLowerCase();
    const first = invoked.split(/\s+/)[0].replace(/^[^a-z0-9_-]+/i, '').replace(/^-/, '');
    let effectiveArgs = Array.isArray(args) ? [...args] : [];
    if (first === 'fonturdu') effectiveArgs = ['urdu', ...effectiveArgs];
    else if (first === 'fontrandom') effectiveArgs = ['random', ...effectiveArgs];
    else if (first === 'fontdl') effectiveArgs = ['dl', ...effectiveArgs];
    else if (first === 'fontlanguage') effectiveArgs = ['lang', ...effectiveArgs];
    else if (first === 'fontname') effectiveArgs = ['search', ...effectiveArgs];
    return handleCommand(sock, message, effectiveArgs, context);
  },
  deliverFontRows,
  downloadSelectedFonts,
  downloadFontFile,
  downloadFontFileForRow,
  _test: { clean: db.clean, safeFileName, menu, render, handleCommand, detectFileType, assertSafeRemoteUrl },
};
