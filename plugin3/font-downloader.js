'use strict';

/**
 * myBOT Font Downloader
 *
 * Location: plugin3/font-downloader.js
 * Loader:   plugins2/font-downloader-loader.js
 *
 * Sources:
 *   - DaFont: search, random, live theme/category browsing, direct download links
 *   - Google Fonts is intentionally NOT part of this plugin. Use the separate gfont plugin.
 *
 * No new npm dependency is required. myBOT already ships axios + cheerio.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const cheerio = require('cheerio');

const ROOT = path.resolve(process.cwd());
const TEMP_DIR = path.join(ROOT, 'tmp', 'fonts');
const MAX_RESULTS = 10;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT = 20_000;
const SEARCH_TIMEOUT = 15_000;
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 myBOT-FontPlugin/2.0';

// Per-chat result cache used by the standalone -fd command.
const FONT_SELECTIONS = new Map();
const selectionKey = (message, context = {}) => context.chatId || message?.key?.remoteJid || 'global';
function rememberSelection(message, context, results) {
  const key = selectionKey(message, context);
  FONT_SELECTIONS.set(key, { createdAt: Date.now(), results: Array.isArray(results) ? results.slice(0, MAX_RESULTS) : [] });
}
function getSelection(message, context) {
  const item = FONT_SELECTIONS.get(selectionKey(message, context));
  if (!item) return [];
  if (Date.now() - item.createdAt > 30 * 60 * 1000) { FONT_SELECTIONS.delete(selectionKey(message, context)); return []; }
  return item.results;
}
async function downloadSelectedFonts(sock, message, context, indexes) {
  const results = getSelection(message, context);
  if (!results.length) return reply(sock, message, context, '❌ No recent font results found. Run a font search/list first.');
  let selected;
  if (indexes === 'all') selected = results;
  else selected = indexes.split(',').map(v => Number(v.trim())).filter(Number.isInteger).map(n => results[n - 1]).filter(Boolean);
  if (!selected.length) return reply(sock, message, context, `❌ Invalid selection. Choose 1-${results.length}, for example ${context.prefix || '-'}fd 1,3,5.`);
  if (selected.length > 5) return reply(sock, message, context, '❌ Maximum 5 fonts per -fd command.');
  const bad = indexes !== 'all' && indexes.split(',').some(v => !/^\s*\d+\s*$/.test(v) || Number(v.trim()) < 1 || Number(v.trim()) > results.length);
  if (bad) return reply(sock, message, context, `❌ Selection must be between 1 and ${results.length}.`);
  for (const font of selected) {
    let temp = null;
    try {
      await reply(sock, message, context, `⏬ Downloading *${font.name}*...`);
      const downloaded = await downloadDaFont(font);
      temp = downloaded.filePath;
      await sendDocument(sock, message, context, downloaded.filePath, downloaded.fileName, 'application/zip', `✅ *${font.name}*\n⚖️ ${font.license.label}`);
    } catch (error) {
      await reply(sock, message, context, `❌ ${font.name}: ${error.message}`);
    } finally { cleanupFile(temp); }
  }
}

const DAFONT_HOSTS = new Set(['www.dafont.com', 'dafont.com', 'dl.dafont.com']);

const LICENSE_KEYS = {
  pd: 'Public domain / GPL / OFL',
  free: '100% Free',
  personal: 'Free for personal use',
  donation: 'Donationware',
  shareware: 'Shareware',
  demo: 'Demo',
  unknown: 'Unknown',
};

const CATEGORY_ALIASES = {
  fancy: 'Fancy',
  cartoon: 'Cartoon',
  comic: 'Comic',
  groovy: 'Groovy',
  oldschool: 'Old School',
  old: 'Old School',
  curly: 'Curly',
  western: 'Western',
  eroded: 'Eroded',
  distorted: 'Distorted',
  destroy: 'Destroy',
  horror: 'Horror',
  fireice: 'Fire, Ice',
  decorative: 'Decorative',
  typewriter: 'Typewriter',
  stencil: 'Stencil, Army',
  retro: 'Retro',
  initials: 'Initials',
  grid: 'Grid',
  various: 'Various',
  chinese: 'Chinese, Jpn',
  japanese: 'Chinese, Jpn',
  jpn: 'Chinese, Jpn',
  arabic: 'Arabic',
  mexican: 'Mexican',
  greek: 'Roman, Greek',
  roman: 'Roman, Greek',
  russian: 'Russian',
  techno: 'Techno',
  square: 'Square',
  lcd: 'LCD',
  scifi: 'Sci-fi',
  bitmap: 'Pixel, Bitmap',
  pixel: 'Pixel, Bitmap',
  gothic: 'Gothic',
  medieval: 'Medieval',
  modern: 'Modern',
  celtic: 'Celtic',
  sans: 'Sans serif',
  sansserif: 'Sans serif',
  serif: 'Serif',
  fixed: 'Fixed width',
  fixedwidth: 'Fixed width',
  script: 'Script',
  calligraphy: 'Calligraphy',
  school: 'School',
  handwritten: 'Handwritten',
  brush: 'Brush',
  trash: 'Trash',
  graffiti: 'Graffiti',
  dingbats: 'Dingbats',
  alien: 'Alien',
  animals: 'Animals',
  asian: 'Asian',
  ancient: 'Ancient',
  runes: 'Runes, Elvish',
  esoteric: 'Esoteric',
  fantastic: 'Fantastic',
  games: 'Games',
  shapes: 'Shapes',
  barcode: 'Bar Code',
  nature: 'Nature',
  sport: 'Sport',
  heads: 'Heads',
  kids: 'Kids',
  tv: 'TV, Movie',
  movie: 'TV, Movie',
  logos: 'Logos',
  sexy: 'Sexy',
  army: 'Army',
  music: 'Music',
  holiday: 'Holiday',
  valentine: 'Valentine',
  easter: 'Easter',
  halloween: 'Halloween',
  christmas: 'Christmas',
};

const LANGUAGE_ALIASES = {
  arabic: 'Arabic',
  urdu: 'Urdu',
  chinese: 'Chinese, Jpn',
  chinesejpn: 'Chinese, Jpn',
  japanese: 'Chinese, Jpn',
  jpn: 'Chinese, Jpn',
  mexican: 'Mexican',
  greek: 'Roman, Greek',
  roman: 'Roman, Greek',
  russian: 'Russian',
};

function ensureTempDir() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function safeFileName(value, fallback = 'font') {
  const normalized = clean(value, fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return normalized || fallback;
}

function absoluteUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    return url.toString();
  } catch {
    return null;
  }
}

function allowedUrl(raw, allowedHosts) {
  try {
    const url = new URL(raw);
    return /^https?:$/i.test(url.protocol) && allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDownloadSize(contentLength) {
  const n = Number(contentLength);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCount(text) {
  const value = clean(text);
  return value || 'N/A';
}

function cardElements($) {
  // Current DaFont exposes font links like /font-name.font. Walk to a nearby
  // container and parse metadata from its visible text instead of relying on
  // obsolete .fontbox/.dl-border selectors.
  const links = $('a[href$=".font"]');
  const cards = [];

  links.each((index, el) => {
    if (cards.length >= MAX_RESULTS) return false;
    const href = absoluteUrl($(el).attr('href'), 'https://www.dafont.com/');
    const name = clean($(el).text());
    if (!href || !name || !href.endsWith('.font')) return;

    let container = $(el);
    for (let i = 0; i < 7; i++) {
      const text = clean(container.text());
      if (/downloads?|100% Free|Free for personal use|Donationware|Shareware|Demo|Public domain/i.test(text)) break;
      container = container.parent();
      if (!container || !container.length) break;
    }

    const text = clean(container.text());
    const preview = container.find('img').first().attr('src');
    const downloadAnchor = container.find('a[href*="dl.dafont.com"], a[href*="/download/"]').first().attr('href');

    cards.push({
      name,
      pageUrl: href,
      previewUrl: absoluteUrl(preview, 'https://www.dafont.com/'),
      downloadUrl: absoluteUrl(downloadAnchor, href),
      downloads: (text.match(/[\d,.]+\s+downloads?(?:\s*\([^)]*\))?/i) || [])[0] || 'N/A',
      license: detectLicense(text),
      rawText: text,
    });
  });

  const unique = new Map();
  for (const item of cards) unique.set(item.pageUrl, item);
  return [...unique.values()];
}

function detectLicense(text) {
  const value = clean(text).toLowerCase();
  for (const [key, label] of Object.entries(LICENSE_KEYS)) {
    if (value.includes(label.toLowerCase())) return { key, label };
  }
  return { key: 'unknown', label: 'Unknown' };
}

async function getHtml(url, timeout = SEARCH_TIMEOUT) {
  const response = await axios.get(url, {
    timeout,
    maxRedirects: 5,
    responseType: 'text',
    decompress: true,
    validateStatus: status => status >= 200 && status < 400,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.dafont.com/',
    },
  });
  return String(response.data || '');
}

async function discoverThemes() {
  const html = await getHtml('https://www.dafont.com/themes.php');
  const $ = cheerio.load(html);
  const themes = [];
  $('a[href*="theme.php?cat="]').each((_, el) => {
    const label = clean($(el).text());
    const href = absoluteUrl($(el).attr('href'), 'https://www.dafont.com/');
    if (!label || !href) return;
    if (!themes.some(x => x.label.toLowerCase() === label.toLowerCase())) {
      themes.push({ label, url: href });
    }
  });
  return themes;
}

async function resolveTheme(query) {
  const wanted = clean(query).toLowerCase();
  if (!wanted) return null;
  const aliases = CATEGORY_ALIASES[wanted] || wanted;
  const themes = await discoverThemes();
  const direct = themes.find(t => t.label.toLowerCase() === String(aliases).toLowerCase());
  if (direct) return direct;
  return themes.find(t => t.label.toLowerCase().includes(wanted)) || null;
}

async function dafontSearch(query, options = {}) {
  const q = clean(query);
  const limit = Math.min(Math.max(Number(options.limit) || MAX_RESULTS, 1), 20);
  let url;

  if (options.themeUrl) {
    url = new URL(options.themeUrl);
    url.searchParams.set('fpp', String(Math.min(Math.max(limit, 10), 200)));
  } else if (options.random) {
    url = new URL('https://www.dafont.com/random.php');
  } else if (q) {
    url = new URL('https://www.dafont.com/search.php');
    url.searchParams.set('q', q);
    url.searchParams.set('fpp', String(Math.min(Math.max(limit, 10), 200)));
  } else {
    url = new URL('https://www.dafont.com/new.php');
    url.searchParams.set('fpp', String(Math.min(Math.max(limit, 10), 200)));
  }

  const html = await getHtml(url.toString());
  const $ = cheerio.load(html);
  let results = cardElements($);

  // Random page layouts can expose only one card. If it fails, use the current
  // homepage/new-fonts page and randomize the parsed result set.
  if (options.random && !results.length) {
    const fallback = await getHtml('https://www.dafont.com/');
    const fallbackResults = cardElements(cheerio.load(fallback));
    results = fallbackResults.sort(() => Math.random() - 0.5);
  }

  if (options.license) {
    const key = String(options.license).toLowerCase();
    results = results.filter(item => item.license.key === key);
  }

  if (options.random && results.length > 1) {
    results = results.sort(() => Math.random() - 0.5);
  }

  return results.slice(0, limit);
}

async function dafontTheme(query, limit = MAX_RESULTS) {
  const theme = await resolveTheme(query);
  if (!theme) throw new Error(`DaFont type/theme not found: ${query}`);
  const results = await dafontSearch('', { themeUrl: theme.url, limit });
  return { theme, results };
}

async function dafontFontInfo(pageUrl) {
  if (!allowedUrl(pageUrl, new Set(['www.dafont.com', 'dafont.com']))) {
    throw new Error('Only valid DaFont pages are allowed.');
  }
  const html = await getHtml(pageUrl);
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || clean($('title').first().text()).replace(/\s*\|\s*daFont.*$/i, '');
  const directDownload = absoluteUrl($('a[href*="dl.dafont.com"], a[href*="/download/"]').first().attr('href'), pageUrl);
  const body = clean($('body').text());
  const license = detectLicense(body);
  const files = [];
  $('a').each((_, el) => {
    const text = clean($(el).text());
    if (/\.(ttf|otf|woff2?|fon)(?:\b|$)/i.test(text)) files.push(text);
  });
  return {
    name: title,
    pageUrl,
    downloadUrl: directDownload,
    license,
    files: [...new Set(files)].slice(0, 20),
  };
}

async function streamToFile(url, filePath, expectedExtensions = []) {
  if (!allowedUrl(url, DAFONT_HOSTS)) {
    throw new Error('Download host is not allowed.');
  }

  ensureTempDir();
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: REQUEST_TIMEOUT,
    maxRedirects: 5,
    validateStatus: status => status >= 200 && status < 300,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
      Referer: 'https://www.dafont.com/',
    },
  });

  const size = parseDownloadSize(response.headers['content-length']);
  if (size !== null && size > MAX_DOWNLOAD_BYTES) {
    response.data.destroy();
    throw new Error(`Font archive is too large (${formatBytes(size)}). Limit is ${formatBytes(MAX_DOWNLOAD_BYTES)}.`);
  }

  let received = 0;
  const writer = fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 });
  try {
    await new Promise((resolve, reject) => {
      response.data.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) {
          response.data.destroy(new Error('Maximum font download size exceeded.'));
          return;
        }
      });
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });
  } catch (error) {
    try { writer.destroy(); } catch {}
    try { fs.unlinkSync(filePath); } catch {}
    throw error;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error('Downloaded font file is empty.');
  }

  return { filePath, bytes: received, contentType: clean(response.headers['content-type'], 'application/octet-stream') };
}

function fileExtensionFromContentType(type) {
  const v = String(type || '').toLowerCase();
  if (v.includes('woff2')) return 'woff2';
  if (v.includes('woff')) return 'woff';
  if (v.includes('opentype')) return 'otf';
  if (v.includes('ttf')) return 'ttf';
  return 'bin';
}

async function downloadDaFont(font) {
  let downloadUrl = font.downloadUrl;
  if (!downloadUrl) {
    const info = await dafontFontInfo(font.pageUrl);
    downloadUrl = info.downloadUrl;
  }
  if (!downloadUrl || !allowedUrl(downloadUrl, DAFONT_HOSTS)) {
    throw new Error('DaFont direct download link was not found.');
  }

  ensureTempDir();
  const fileName = `${safeFileName(font.name)}-DaFont-${Date.now()}.zip`;
  const filePath = path.join(TEMP_DIR, fileName);
  const result = await streamToFile(downloadUrl, filePath);
  return { ...result, fileName };
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function reply(sock, message, context, text) {
  return sock.sendMessage(context.chatId || message.key.remoteJid, { text }, { quoted: message });
}

async function sendDocument(sock, message, context, filePath, fileName, mimetype, caption) {
  const jid = context.chatId || message.key.remoteJid;
  const buffer = fs.readFileSync(filePath);
  await sock.sendMessage(jid, {
    document: buffer,
    mimetype,
    fileName,
    caption,
  }, { quoted: message });
}

function cleanupFile(filePath) {
  try { if (filePath) fs.rmSync(filePath, { force: true }); } catch {}
}

function cleanupOldFiles() {
  ensureTempDir();
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const name of fs.readdirSync(TEMP_DIR)) {
    const file = path.join(TEMP_DIR, name);
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.mtimeMs < cutoff) fs.rmSync(file, { force: true });
    } catch {}
  }
}

setInterval(cleanupOldFiles, 10 * 60 * 1000).unref?.();

function menu(prefix) {
  return [
    '╭━━━〔 🎨 myBOT FONT DOWNLOADER 〕━━━╮',
    '┃',
    `┃ 1. ${prefix}font random`,
    `┃ 2. ${prefix}font search <name>`,
    `┃ 3. ${prefix}font dl <name>`,
    `┃ 4. ${prefix}font info <name>`,
    `┃ 5. ${prefix}font type <type>`,
    `┃ 6. ${prefix}font types`,
    `┃ 7. ${prefix}font lang <language>`,
    `┃ 8. ${prefix}font urdu`,
    `┃ 9. ${prefix}font urdu random`,
    `┃ 10. ${prefix}font urdu <name>`,
    `┃ 11. ${prefix}font license <free|personal|pd|donation|demo>`,
    '┃',
    '┃ Examples:',
    `┃ ${prefix}font search anime`,
    `┃ ${prefix}font type calligraphy`,
    `┃ ${prefix}font lang arabic`,
    `┃ ${prefix}font urdu Noto Nastaliq Urdu`,
    '┃',
    '┃ Selection download:',
    `┃ ${prefix}fd 1`,
    `┃ ${prefix}fd 1,3,5`,
    `┃ ${prefix}fd all`,
    '┃',
    '┃ ℹ️ DaFont licensing varies by font.',
    '┃ Check the font page/readme before',
    '┃ commercial use.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

async function listTypes(sock, message, context) {
  const themes = await discoverThemes();
  const lines = themes.map(t => `• ${t.label}`).join('\n');
  return reply(sock, message, context, `🗂️ *DAFONT TYPES / THEMES*\n\n${lines.slice(0, 6000)}`);
}

async function handleCommand(sock, message, args, context = {}) {
  cleanupOldFiles();
  const prefix = context.prefix || '-';
  const sub = clean(args?.[0]).toLowerCase();

  if (!sub || sub === 'menu' || sub === 'help') {
    return reply(sock, message, context, menu(prefix));
  }

  if (sub === 'fd') {
    const selection = clean(args.slice(1).join(' ')).toLowerCase();
    if (!selection) return reply(sock, message, context, `Usage: ${prefix}fd <number|number,number|all>`);
    return downloadSelectedFonts(sock, message, context, selection);
  }

  if (sub === 'types' || sub === 'themes' || sub === 'categories') {
    try { return await listTypes(sock, message, context); }
    catch (error) { return reply(sock, message, context, `❌ Could not load DaFont types: ${error.message}`); }
  }

  if (sub === 'random') {
    const requestedTheme = args.slice(1).join(' ').trim();
    try {
      const data = requestedTheme ? await dafontTheme(requestedTheme, 20) : { results: await dafontSearch('', { random: true, limit: 10 }) };
      const font = pickRandom(data.results);
      if (!font) return reply(sock, message, context, '❌ No random DaFont font was found.');
      rememberSelection(message, context, data.results);
      return reply(sock, message, context,
        `🎲 *Random DaFont Font*\n\n` +
        `*Name:* ${font.name}\n` +
        `*License:* ${font.license.label}\n` +
        `*Downloads:* ${formatCount(font.downloads)}\n` +
        `*Page:* ${font.pageUrl}\n\n` +
        `Use ${prefix}font dl ${font.name}`
      );
    } catch (error) {
      return reply(sock, message, context, `❌ Random font lookup failed: ${error.message}`);
    }
  }

  if (sub === 'search' || sub === 'find') {
    const query = clean(args.slice(1).join(' '));
    if (!query) return reply(sock, message, context, `Usage: ${prefix}font search <font name>`);
    try {
      const results = await dafontSearch(query, { limit: MAX_RESULTS });
      if (!results.length) return reply(sock, message, context, `❌ No DaFont results for *${query}*.`);
      rememberSelection(message, context, results);
      const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.license.label}\n   ${f.pageUrl}`);
      return reply(sock, message, context, `🔎 *DaFont Search:* ${query}\n\n${lines.join('\n')}`);
    } catch (error) {
      return reply(sock, message, context, `❌ DaFont search failed: ${error.message}`);
    }
  }

  if (sub === 'dl' || sub === 'download') {
    const name = clean(args.slice(1).join(' '));
    if (!name) return reply(sock, message, context, `Usage: ${prefix}font dl <font name>`);
    let temp = null;
    try {
      const results = await dafontSearch(name, { limit: 5 });
      const normalizedName = name.toLowerCase();
      const target = results.find(item => item.name.toLowerCase() === normalizedName) || results[0];
      if (!target) return reply(sock, message, context, `❌ Font *${name}* was not found on DaFont.`);
      await reply(sock, message, context, `⏬ Downloading *${target.name}* from DaFont...`);
      const downloaded = await downloadDaFont(target);
      temp = downloaded.filePath;
      await sendDocument(sock, message, context, downloaded.filePath, downloaded.fileName, 'application/zip',
        `✅ *${target.name}* downloaded from DaFont\n📦 ${formatBytes(downloaded.bytes)}\n⚖️ ${target.license.label}`);
      return;
    } catch (error) {
      return reply(sock, message, context, `❌ DaFont download failed: ${error.message}`);
    } finally {
      cleanupFile(temp);
    }
  }

  if (sub === 'info') {
    const name = clean(args.slice(1).join(' '));
    if (!name) return reply(sock, message, context, `Usage: ${prefix}font info <font name>`);
    try {
      const results = await dafontSearch(name, { limit: 1 });
      if (!results.length) return reply(sock, message, context, `❌ Font *${name}* was not found.`);
      const info = await dafontFontInfo(results[0].pageUrl);
      return reply(sock, message, context,
        `ℹ️ *${info.name}*\n\n` +
        `License: ${info.license.label}\n` +
        `Files: ${info.files.length ? info.files.join(', ') : 'See font page'}\n` +
        `Page: ${info.pageUrl}\n` +
        `Download: ${info.downloadUrl || 'Not exposed'}`
      );
    } catch (error) {
      return reply(sock, message, context, `❌ Font info failed: ${error.message}`);
    }
  }

  if (sub === 'type' || sub === 'category' || sub === 'theme') {
    const type = clean(args.slice(1).join(' '));
    if (!type) return reply(sock, message, context, `Usage: ${prefix}font type <type/theme>`);
    try {
      const { theme, results } = await dafontTheme(type, MAX_RESULTS);
      if (!results.length) return reply(sock, message, context, `❌ No fonts found in *${theme.label}*.`);
      rememberSelection(message, context, results);
      const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.license.label}`);
      return reply(sock, message, context, `📂 *DaFont: ${theme.label}*\n\n${lines.join('\n')}`);
    } catch (error) {
      return reply(sock, message, context, `❌ Type search failed: ${error.message}`);
    }
  }

  if (sub === 'lang' || sub === 'language') {
    const language = clean(args.slice(1).join(' '));
    if (!language) return reply(sock, message, context, `Usage: ${prefix}font lang <language>`);

    const normalized = language.toLowerCase().replace(/[^a-z]+/g, '');
    if (normalized === 'urdu') {
      return reply(sock, message, context,
        `🌐 *Urdu language fonts*\n\n` +
        `Use ${prefix}font urdu random\n` +
        `or ${prefix}font urdu <name>\n\n` +
        `For DaFont Arabic-script results: ${prefix}font type arabic`
      );
    }

    try {
      const targetTheme = LANGUAGE_ALIASES[normalized] || language;
      const { theme, results } = await dafontTheme(targetTheme, MAX_RESULTS);
      if (!results.length) return reply(sock, message, context, `❌ No DaFont results found for language/theme *${language}*.`);
      rememberSelection(message, context, results);
      const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.license.label}`);
      return reply(sock, message, context,
        `🌐 *Language / script: ${theme.label}*\n\n${lines.join('\n')}\n\n` +
        `_DaFont language coverage is theme-based, not a universal language classifier._`
      );
    } catch (error) {
      return reply(sock, message, context, `❌ Language lookup failed: ${error.message}`);
    }
  }

  if (sub === 'license' || sub === 'free') {
    const licenseArg = clean(args.slice(1).join(' '), sub === 'free' ? 'free' : '');
    if (!licenseArg) return reply(sock, message, context, `Usage: ${prefix}font license <free|personal|pd|donation|shareware|demo>`);
    const key = licenseArg.toLowerCase().replace(/[^a-z]+/g, '');
    if (!LICENSE_KEYS[key]) return reply(sock, message, context, `❌ Unknown license filter. Use ${prefix}font license free`);
    try {
      const results = await dafontSearch('', { limit: MAX_RESULTS, license: key });
      if (!results.length) return reply(sock, message, context, `❌ No fonts matching *${LICENSE_KEYS[key]}* were returned on this DaFont page.`);
      rememberSelection(message, context, results);
      const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.pageUrl}`);
      return reply(sock, message, context, `⚖️ *DaFont license filter: ${LICENSE_KEYS[key]}*\n\n${lines.join('\n')}`);
    } catch (error) {
      return reply(sock, message, context, `❌ License filter failed: ${error.message}`);
    }
  }

  if (sub === 'urdu') {
    const request = clean(args.slice(1).join(' '));
    const urduTheme = CATEGORY_ALIASES.arabic || 'Arabic';
    if (!request || /^(list|menu|help)$/i.test(request)) {
      try {
        const { theme, results } = await dafontTheme(urduTheme, MAX_RESULTS);
        rememberSelection(message, context, results);
        const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.license.label}`);
        return reply(sock, message, context, `🇵🇰 *URDU / ARABIC-SCRIPT FONTS*\n\n${lines.join('\n')}\n\n${prefix}font urdu random\n${prefix}font urdu <name>`);
      } catch (error) {
        return reply(sock, message, context, `❌ Urdu font list failed: ${error.message}`);
      }
    }
    try {
      if (/^random$/i.test(request)) {
        const { results } = await dafontTheme(urduTheme, MAX_RESULTS);
        const font = pickRandom(results);
        if (!font) return reply(sock, message, context, '❌ No Arabic/Urdu-script fonts were found.');
        return reply(sock, message, context, `🎲 *Random Urdu / Arabic-script font*\n\n*${font.name}*\nLicense: ${font.license.label}\n\nUse ${prefix}font dl ${font.name}`);
      }
      const results = await dafontSearch(request, { limit: MAX_RESULTS });
      const target = results.find(f => /arabic|urdu|naskh|nastaliq/i.test(`${f.name} ${f.category || ''}`)) || results[0];
      if (!target) return reply(sock, message, context, `❌ Urdu font *${request}* was not found on DaFont.`);
      return reply(sock, message, context, `🔤 *${target.name}*\nLicense: ${target.license.label}\n\nUse ${prefix}font dl ${target.name}`);
    } catch (error) {
      return reply(sock, message, context, `❌ Urdu font lookup failed: ${error.message}`);
    }
  }

  if (sub === 'arabic') {
    try {
      const { theme, results } = await dafontTheme('Arabic', MAX_RESULTS);
      rememberSelection(message, context, results);
      const lines = results.map((f, i) => `${i + 1}. *${f.name}* — ${f.license.label}`);
      return reply(sock, message, context, `🌐 *Arabic / Arabic-script fonts*\n\n${lines.join('\n')}\n\nUse ${prefix}fd 1 or ${prefix}font dl <name>`);
    } catch (error) {
      return reply(sock, message, context, `❌ Arabic font lookup failed: ${error.message}`);
    }
  }

  return reply(sock, message, context, menu(prefix));
}

module.exports = { handler: handleCommand, _test: { safeFileName, detectLicense, resolveTheme, dafontSearch, dafontFontInfo } };
