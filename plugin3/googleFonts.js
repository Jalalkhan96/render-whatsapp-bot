'use strict';

/**
 * Google Fonts downloader for myBOT.
 *
 * No extra npm dependency is required; Node.js 20+ provides global fetch().
 * The plugin prefers the Google Fonts Developer API when GOOGLE_FONTS_API_KEY
 * is configured (TTF files), and otherwise falls back to the public CSS2 API
 * (WOFF2 files). Both endpoints are documented by Google.
 */

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const RANDOM_FONTS = [
  'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Lato', 'Oswald',
  'Raleway', 'Nunito', 'Ubuntu', 'Merriweather', 'Playfair Display',
  'Inter', 'DM Sans', 'Manrope', 'Rubik', 'Quicksand', 'Kanit',
  'Bebas Neue', 'Pacifico', 'Lobster', 'Comfortaa', 'Figtree',
  'Space Grotesk', 'Sora', 'Josefin Sans', 'Libre Baskerville',
  'Source Sans 3', 'Work Sans', 'Barlow', 'Titillium Web',
];

const LANGUAGE_FONTS = {
  urdu: [
    'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic',
    'Lateef', 'Amiri', 'Scheherazade New', 'Markazi Text',
  ],
  pashto: [
    'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic',
    'Lateef', 'Amiri', 'Markazi Text',
  ],
  arabic: [
    'Noto Sans Arabic', 'Noto Naskh Arabic', 'Amiri', 'Cairo',
    'Tajawal', 'Changa', 'El Messiri', 'Reem Kufi', 'Lateef',
  ],
  persian: [
    'Vazirmatn', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Amiri',
    'Markazi Text', 'Lateef',
  ],
  farsi: [
    'Vazirmatn', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Amiri',
    'Markazi Text', 'Lateef',
  ],
  hindi: [
    'Noto Sans Devanagari', 'Noto Serif Devanagari', 'Hind', 'Mukta',
    'Baloo 2', 'Kalam',
  ],
  bengali: [
    'Noto Sans Bengali', 'Hind Siliguri', 'Noto Serif Bengali', 'Baloo Da 2',
  ],
  punjabi: [
    'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic',
  ],
  english: [
    'Roboto', 'Poppins', 'Open Sans', 'Lato', 'Montserrat', 'Inter',
    'Nunito Sans', 'Source Sans 3', 'Work Sans', 'DM Sans',
  ],
  russian: ['Roboto', 'Open Sans', 'PT Sans', 'Noto Sans', 'Rubik'],
  turkish: ['Roboto', 'Open Sans', 'Montserrat', 'Nunito', 'Inter'],
  german: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Inter'],
  french: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito'],
  spanish: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito'],
  italian: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito'],
};

const STYLE_MAP = {
  thin: 100,
  extralight: 200,
  'extra-light': 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  'semi-bold': 600,
  bold: 700,
  extrabold: 800,
  'extra-bold': 800,
  black: 900,
  heavy: 900,
};

const cache = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeFamily(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '');
}

function keyFamily(value) {
  return normalizeFamily(value).toLowerCase();
}

function parseStyleTokens(tokens) {
  const values = tokens.map((v) => String(v || '').toLowerCase()).filter(Boolean);
  let italic = false;
  let weight = 400;

  for (const value of values) {
    if (value === 'italic' || value === 'oblique' || value === 'bolditalic' || value === 'bold-italic') {
      italic = true;
      if (value.startsWith('bold')) weight = 700;
      continue;
    }
    if (/^\d{3}$/.test(value)) {
      const n = Number(value);
      if (n >= 100 && n <= 900) weight = n;
      continue;
    }
    if (STYLE_MAP[value] != null) weight = STYLE_MAP[value];
  }

  return { italic, weight };
}

function fontSpec(family, style) {
  const encoded = encodeURIComponent(family).replace(/%20/g, '+');
  const { italic, weight } = parseStyleTokens(style);
  const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  return { encoded, italic, weight, axis };
}

function withTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function readLimitedBody(response, maxBytes = MAX_DOWNLOAD_BYTES) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Font file is larger than the configured limit.');
    return buffer;
  }

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error('Font file is larger than the configured 12 MB limit.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function extractCssFontFiles(css) {
  const results = [];
  const blocks = String(css || '').match(/@font-face\s*\{[\s\S]*?\}/gi) || [];
  for (const block of blocks) {
    const weight = /font-weight\s*:\s*([^;]+);?/i.exec(block)?.[1]?.trim() || '';
    const style = /font-style\s*:\s*([^;]+);?/i.exec(block)?.[1]?.trim() || '';
    const unicodeRange = /unicode-range\s*:\s*([^;]+);?/i.exec(block)?.[1]?.trim() || '';
    const urls = [...block.matchAll(/url\((['"]?)(https:\/\/[^)'"\s]+)\1\)\s*format\((['"]?)woff2\3\)/gi)].map((m) => m[2]);
    for (const url of urls) results.push({ weight, style, unicodeRange, url });
  }
  return results;
}

function scoreUnicodeRange(range, script) {
  const value = String(range || '').toLowerCase();
  if (script === 'arabic') {
    return /u\+0?6[0-9a-f]{2}|u\+0?7[0-9a-f]{2}|u\+08[0-9a-f]{2}|u\+fb[0-9a-f]{2}|u\+fe[0-9a-f]{2}/i.test(value) ? 100 : 0;
  }
  if (script === 'devanagari') return /u\+09[0-9a-f]{2}/i.test(value) ? 100 : 0;
  if (script === 'bengali') return /u\+09[0-9a-f]{2}/i.test(value) ? 100 : 0;
  if (script === 'cyrillic') return /u\+04[0-9a-f]{2}/i.test(value) ? 100 : 0;
  return /u\+0000|u\+0100/i.test(value) ? 10 : 0;
}

function chooseCssFile(files, desired, script) {
  if (!files.length) return null;
  const candidates = files.slice().sort((a, b) => {
    const score = (entry) => {
      let s = 0;
      const w = String(entry.weight).toLowerCase();
      const st = String(entry.style).toLowerCase();
      if (w.includes(String(desired.weight))) s += 50;
      if (desired.italic && st.includes('italic')) s += 40;
      if (!desired.italic && st.includes('normal')) s += 40;
      s += scoreUnicodeRange(entry.unicodeRange, script);
      return s;
    };
    return score(b) - score(a);
  });
  return candidates[0];
}

function normalizeLanguage(language) {
  const key = String(language || '').trim().toLowerCase().replace(/[_-]/g, ' ');
  const aliases = {
    ur: 'urdu', 'urud': 'urdu',
    ps: 'pashto', 'pašto': 'pashto',
    ar: 'arabic', 'fa': 'persian', 'per': 'persian',
    hi: 'hindi', 'bn': 'bengali', 'ru': 'russian', 'tr': 'turkish',
    en: 'english', 'de': 'german', 'fr': 'french', 'es': 'spanish', 'it': 'italian',
  };
  return aliases[key] || key;
}

function parseArgs(args) {
  const raw = args.map((v) => String(v || '').trim()).filter(Boolean);
  const sub = (raw[0] || 'menu').toLowerCase();
  return { raw, sub };
}

function isInteger(value) {
  return /^\d+$/.test(String(value || ''));
}

function previewSize(args) {
  const candidate = args.find(isInteger);
  if (!candidate) return 32;
  return Math.max(10, Math.min(96, Number(candidate)));
}

function styleArgs(args) {
  return args.filter((v) => !isInteger(v));
}

async function getDeveloperFont(family, style) {
  const apiKey = process.env.GOOGLE_FONTS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ key: apiKey, family });
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?${params.toString()}`;
  const response = await withTimeout(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Google Fonts Developer API returned HTTP ${response.status}.`);
  const data = await response.json();
  const item = Array.isArray(data.items) ? data.items[0] : null;
  if (!item) return null;

  const { italic, weight } = parseStyleTokens(style);
  const variantKeys = Object.keys(item.files || {});
  const wanted = italic ? `${weight}italic` : String(weight);
  const variant = item.files?.[wanted] || item.files?.regular || item.files?.['400'] || item.files?.[`${weight}`] || variantKeys[0];
  const fileUrl = variant ? item.files?.[variant] : null;
  if (!fileUrl) return null;

  return {
    family: item.family,
    url: fileUrl,
    variant,
    format: String(fileUrl).toLowerCase().endsWith('.ttf') ? 'ttf' : 'woff2',
    subsets: item.subsets || [],
  };
}

async function getCssFont(family, style, script = '') {
  const spec = fontSpec(family, style);
  const subsetParam = script === 'arabic' ? '&subset=arabic' : '';
  const url = `https://fonts.googleapis.com/css2?family=${spec.encoded}:${spec.axis}&display=swap${subsetParam}`;
  const cacheKey = `${keyFamily(family)}|${spec.axis}|${script}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await withTimeout(url, {
    headers: {
      accept: 'text/css,*/*;q=0.1',
      // Google Fonts returns different CSS for different clients.
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`Google Fonts CSS API returned HTTP ${response.status}.`);
  const css = await response.text();
  const files = extractCssFontFiles(css);
  const chosen = chooseCssFile(files, { italic: spec.italic, weight: spec.weight }, script);
  if (!chosen?.url) throw new Error('Google Fonts returned no downloadable WOFF2 font for that request.');

  const value = {
    family,
    url: chosen.url,
    variant: `${spec.italic ? 'italic' : 'normal'} ${spec.weight}`,
    format: 'woff2',
    subsets: script ? [script] : [],
    stylesheet: url,
  };
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function resolveFont(family, style, script = '') {
  const normalized = normalizeFamily(family);
  if (!normalized) throw new Error('Font name is required.');

  if (process.env.GOOGLE_FONTS_API_KEY) {
    try {
      const developer = await getDeveloperFont(normalized, style);
      if (developer) return developer;
    } catch (error) {
      // Fall back to CSS2; do not make an API-key problem break the plugin.
      console.warn(`[GOOGLE FONTS] Developer API fallback: ${error.message}`);
    }
  }
  return getCssFont(normalized, style, script);
}

async function downloadFont(fontInfo) {
  const response = await withTimeout(fontInfo.url, {
    headers: { accept: '*/*', 'user-agent': 'myBOT-GoogleFonts/1.0' },
  });
  if (!response.ok) throw new Error(`Font file request returned HTTP ${response.status}.`);

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error('Font file is larger than the configured 12 MB limit.');
  }
  const buffer = await readLimitedBody(response);
  if (!buffer.length) throw new Error('Google Fonts returned an empty font file.');

  // Basic file-signature checks; do not rely on an API declaring success alone.
  const signature = buffer.length >= 4 ? buffer.slice(0, 4).toString() : '';
  const isTtf = buffer.length >= 4 && (buffer.readUInt32BE(0) === 0x00010000 || signature === 'true' || signature === 'OTTO' || signature === 'ttcf');
  const isWoff2 = buffer.length >= 4 && buffer.slice(0, 4).toString() === 'wOF2';
  if (!isTtf && !isWoff2 && !contentType.includes('font') && !contentType.includes('octet-stream')) {
    throw new Error('Downloaded data does not look like a font file.');
  }
  return buffer;
}

function safeFileName(family, style, ext) {
  const clean = `${family}-${style || 'regular'}`
    .replace(/[^a-z0-9._ -]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${clean || 'google-font'}.${ext}`;
}

function menuText(prefix) {
  return [
    '╭━━━〔 𝙶𝙾𝙾𝙶𝙻𝙴 𝙵𝙾𝙽𝚃𝚂 〕━━━╮',
    '┃',
    `┃ ${prefix}font random`,
    `┃ ${prefix}font urdu`,
    `┃ ${prefix}font language <language>`,
    `┃ ${prefix}font name <font> [style] [size]`,
    `┃ ${prefix}font search <name>`,
    `┃ ${prefix}font styles <name>`,
    '┃',
    '┃ Style: regular | italic | light | medium | semibold | bold | black',
    '┃ Size = preview/metadata size (10–96px).',
    '┃ Download format is TTF when GOOGLE_FONTS_API_KEY is set,',
    '┃ otherwise WOFF2 via the public CSS2 endpoint.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

function infoText(font, style, size, commandPrefix) {
  return [
    `✅ *Google Font:* ${font.family}`,
    `🎨 *Style:* ${style || font.variant || 'regular'}`,
    `📐 *Size:* ${size}px`,
    `📦 *Format:* ${font.format.toUpperCase()}`,
    `🔗 *CSS:* ${font.stylesheet || `https://fonts.google.com/specimen/${encodeURIComponent(font.family).replace(/%20/g, '+')}`}`,
    '',
    `Use *${commandPrefix}font name ${font.family} bold 32* to request another weight/size.`,
  ].join('\n');
}

async function sendResolvedFont(sock, message, font, style, size, context) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) throw new Error('Chat JID is missing.');
  const buffer = await downloadFont(font);
  const ext = font.format === 'ttf' ? 'ttf' : 'woff2';
  const fileName = safeFileName(font.family, style || font.variant, ext);
  await sock.sendMessage(jid, {
    document: buffer,
    fileName,
    mimetype: font.format === 'ttf' ? 'font/ttf' : 'font/woff2',
    caption: infoText(font, style || font.variant, size, context.prefix || '-'),
  }, { quoted: message });
}

async function randomByLanguage(language, style) {
  const lang = normalizeLanguage(language);
  const families = LANGUAGE_FONTS[lang];
  if (!families) throw new Error(`Unsupported language *${language}*. Try: ${Object.keys(LANGUAGE_FONTS).join(', ')}.`);

  const candidates = families.slice().sort(() => Math.random() - 0.5);
  let lastError;
  for (const family of candidates) {
    try {
      const font = await resolveFont(family, style, ['urdu', 'pashto', 'arabic', 'persian', 'farsi', 'punjabi'].includes(lang) ? 'arabic' : '');
      return { font, language: lang };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`No Google Font could be resolved for ${lang}.`);
}

async function stylesForFont(family) {
  // Lightweight styles check using the CSS2 endpoint; no Developer API key required.
  const styles = [];
  for (const [label, tokens] of [
    ['regular', ['regular']],
    ['italic', ['italic']],
    ['light', ['light']],
    ['medium', ['medium']],
    ['semibold', ['semibold']],
    ['bold', ['bold']],
    ['black', ['black']],
  ]) {
    try {
      const font = await resolveFont(family, tokens.join(' '));
      if (font) styles.push(label);
    } catch {}
  }
  return [...new Set(styles)];
}

async function searchFonts(query) {
  const q = keyFamily(query);
  if (!q) return [];
  if (process.env.GOOGLE_FONTS_API_KEY) {
    const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(process.env.GOOGLE_FONTS_API_KEY)}&sort=popularity`;
    const response = await withTimeout(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Google Fonts Developer API returned HTTP ${response.status}.`);
    const data = await response.json();
    return (data.items || []).filter((item) => keyFamily(item.family).includes(q)).slice(0, 12);
  }
  return RANDOM_FONTS.filter((name) => keyFamily(name).includes(q)).map((family) => ({ family }));
}

async function handleFontCommand(sock, message, args, context = {}) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) throw new Error('Chat JID is missing.');

  const rawArgs = args.map((v) => String(v || '').trim()).filter(Boolean);
  const invokedText = String(context.rawText || context.messageText || '').trim().toLowerCase();
  const invokedCommand = invokedText.split(/\s+/)[0].replace(/^[^a-z0-9_-]+/i, '');
  let effectiveArgs = rawArgs;
  if (!rawArgs.length && invokedCommand === 'fonturdu') effectiveArgs = ['urdu'];
  else if (!rawArgs.length && invokedCommand === 'fontrandom') effectiveArgs = ['random'];
  else if (!rawArgs.length && invokedCommand === 'fontmenu') effectiveArgs = ['menu'];

  const { raw, sub } = parseArgs(effectiveArgs);
  const prefix = context.prefix || '-';

  if (sub === 'menu' || sub === 'help') {
    return sock.sendMessage(jid, { text: menuText(prefix) }, { quoted: message });
  }

  if (sub === 'random') {
    const language = raw[1];
    const style = styleArgs(raw.slice(2));
    let font;
    if (language) {
      ({ font } = await randomByLanguage(language, style));
    } else {
      const pool = RANDOM_FONTS.slice().sort(() => Math.random() - 0.5);
      let lastError;
      for (const family of pool) {
        try {
          font = await resolveFont(family, style);
          break;
        } catch (error) { lastError = error; }
      }
      if (!font) throw lastError || new Error('Could not resolve a random Google Font.');
    }
    return sendResolvedFont(sock, message, font, style.join(' ') || 'regular', previewSize(raw.slice(2)), context);
  }

  if (sub === 'urdu' || sub === 'pashto' || sub === 'arabic' || sub === 'persian' || sub === 'farsi' || sub === 'punjabi') {
    const style = styleArgs(raw.slice(1));
    const { font } = await randomByLanguage(sub, style);
    return sendResolvedFont(sock, message, font, style.join(' ') || 'regular', previewSize(raw.slice(1)), context);
  }

  if (sub === 'language') {
    const language = raw[1];
    if (!language) return sock.sendMessage(jid, { text: `Usage: ${prefix}font language <language> [style] [size]` }, { quoted: message });
    const style = styleArgs(raw.slice(2));
    const { font } = await randomByLanguage(language, style);
    return sendResolvedFont(sock, message, font, style.join(' ') || 'regular', previewSize(raw.slice(2)), context);
  }

  if (sub === 'name') {
    if (!raw[1]) return sock.sendMessage(jid, { text: `Usage: ${prefix}font name <Google Font Name> [style] [size]` }, { quoted: message });
    const size = previewSize(raw.slice(2));
    const style = styleArgs(raw.slice(2));
    // Font names can contain spaces; the first numeric/style tokens are reserved for options.
    const nameTokens = raw.slice(1).filter((token) => !isInteger(token) && STYLE_MAP[token.toLowerCase()] == null && !['italic', 'oblique'].includes(token.toLowerCase()));
    const family = normalizeFamily(nameTokens.join(' '));
    const font = await resolveFont(family, style);
    return sendResolvedFont(sock, message, font, style.join(' ') || 'regular', size, context);
  }

  if (sub === 'search') {
    const results = await searchFonts(raw.slice(1).join(' '));
    if (!results.length) return sock.sendMessage(jid, { text: '🔎 No matching Google Fonts were found.' }, { quoted: message });
    const lines = results.slice(0, 12).map((item, index) => `${index + 1}. ${item.family}`);
    return sock.sendMessage(jid, { text: `🔎 *GOOGLE FONT SEARCH*\n\n${lines.join('\n')}\n\nUse ${prefix}font name <font name> [style] [size]` }, { quoted: message });
  }

  if (sub === 'styles') {
    const family = normalizeFamily(raw.slice(1).join(' '));
    if (!family) return sock.sendMessage(jid, { text: `Usage: ${prefix}font styles <Google Font Name>` }, { quoted: message });
    const styles = await stylesForFont(family);
    return sock.sendMessage(jid, { text: styles.length ? `🎨 *${family}*\nAvailable styles: ${styles.join(', ')}` : `❌ Could not resolve styles for *${family}*.` }, { quoted: message });
  }

  // Convenient direct form: -font Poppins bold 32
  const size = previewSize(raw.slice(0));
  const style = styleArgs(raw.slice(1));
  const nameTokens = raw.filter((token, index) => index === 0 || (STYLE_MAP[token.toLowerCase()] == null && !['italic', 'oblique'].includes(token.toLowerCase()) && !isInteger(token)));
  const family = normalizeFamily(nameTokens.join(' '));
  if (!family) return sock.sendMessage(jid, { text: menuText(prefix) }, { quoted: message });
  const font = await resolveFont(family, style);
  return sendResolvedFont(sock, message, font, style.join(' ') || 'regular', size, context);
}

module.exports = { handler: handleFontCommand, _internal: { extractCssFontFiles, chooseCssFile, parseStyleTokens, normalizeFamily, normalizeLanguage, fontSpec } };
