import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '../tmp/fonts');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const FONT_API = 'https://api.fontsource.org/v1/fonts';
const FONT_ID_API = 'https://api.fontsource.org/v1/fonts';
const DA = 'https://www.dafont.com';
const UA = 'myBOT Font Downloader/2.0';

const URDU_FONTS = {
  'noto-nastaliq': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/NotoNastaliqUrduDraft.woff', ext: 'woff', type: 'Nastaliq' },
  'jameel-noori': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/JameelNooriNastaleeq.woff', ext: 'woff', type: 'Nastaliq' },
  'mehr-nastaleeq': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/MehrNastaleeq.ttf', ext: 'ttf', type: 'Nastaliq' },
  'pdms-jauhar': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/_PDMS_Jauhar_Regular.woff', ext: 'woff', type: 'Nastaliq' },
  'pdms-nafees': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/PDMS_NastaliqNafees.ttf', ext: 'ttf', type: 'Nastaliq' },
  'lahori-nastaleeq': { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/AlviLahoriNastaleeq.woff2', ext: 'woff2', type: 'Nastaliq' },
  akbar: { url: 'https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN/Akbar.woff', ext: 'woff', type: 'Display' }
};

const LANG_MAP = {
  arabic: 'arabic', chinese: 'chinese-simplified', japanese: 'japanese', russian: 'cyrillic', greek: 'greek', urdu: 'arabic'
};

const TYPE_MAP = {
  sans: 'sans-serif', 'sans-serif': 'sans-serif', serif: 'serif', display: 'display', handwriting: 'handwriting', script: 'handwriting', monospace: 'monospace'
};

const LICENSE_HELP = {
  free: 'Free / open fonts. Google Fonts are generally open licensed.',
  personal: 'Personal-use fonts are primarily a DaFont licensing category.',
  pd: 'Public-domain / GPL / OFL style open licensing.',
  donation: 'Donationware is primarily a DaFont licensing category.',
  shareware: 'Shareware is primarily a DaFont licensing category.',
  demo: 'Demo fonts are primarily a DaFont licensing category.'
};

function remember(chat, results) {
  if (!global.__fontResults) global.__fontResults = new Map();
  global.__fontResults.set(chat, { results, at: Date.now() });
}

function getRemembered(chat) {
  return global.__fontResults?.get(chat)?.results || [];
}

async function googleList(params = {}) {
  const { data } = await axios.get(FONT_API, { params, timeout: 20000, headers: { 'User-Agent': UA } });
  return Array.isArray(data) ? data : [];
}

async function googleSearch(query, limit = 10) {
  const all = await googleList({ type: 'google' });
  const q = query.toLowerCase();
  return all.filter(f => f.family.toLowerCase().includes(q)).slice(0, limit);
}

async function googleFilterBySubset(subset, limit = 10) {
  const all = await googleList({ type: 'google' });
  return all.filter(f => (f.subsets || []).some(s => s.toLowerCase() === subset.toLowerCase())).slice(0, limit);
}

async function googleFilterByCategory(category, limit = 10) {
  const cat = TYPE_MAP[category] || category;
  const all = await googleList({ type: 'google', category: cat });
  return all.slice(0, limit);
}

async function googleInfo(name) {
  const matches = await googleSearch(name, 5);
  if (!matches.length) return null;
  const exact = matches.find(x => x.family.toLowerCase() === name.toLowerCase());
  const base = exact || matches[0];
  const { data } = await axios.get(`${FONT_ID_API}/${base.id}`, { timeout: 20000, headers: { 'User-Agent': UA } });
  return data;
}

function fontsourceUrl(info, ext = 'ttf') {
  const weight = (info.weights || [400]).includes(400) ? 400 : info.weights?.[0] || 400;
  const style = (info.styles || []).includes('normal') ? 'normal' : info.styles?.[0] || 'normal';
  const subset = info.defSubset || (info.subsets || ['latin'])[0];
  const variant = info.variants?.[String(weight)]?.[style]?.[subset]?.url;
  return variant?.[ext] || variant?.woff2 || null;
}

async function downloadUrl(url, fileName) {
  const filePath = path.join(TEMP_DIR, `${Date.now()}_${fileName}`.replace(/[^a-zA-Z0-9._-]/g, '_'));
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA } });
  fs.writeFileSync(filePath, response.data);
  return { filePath, fileName };
}

async function scrapeDaFont(query = '', options = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const url = options.random ? `${DA}/random.php` : `${DA}/search.php?${params}`;
  const { data: html } = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': UA } });
  const $ = cheerio.load(html);
  const fonts = [];
  $('a').each((_, el) => {
    if (fonts.length >= 10) return false;
    const href = $(el).attr('href');
    const name = $(el).text().trim();
    if (!href || !name || !/^\/[^/]+\.php$/i.test(href)) return;
    if (fonts.some(f => f.pageUrl === DA + href)) return;
    fonts.push({ name, pageUrl: DA + href, source: 'DaFont' });
  });
  return fonts;
}

async function downloadDaFont(pageUrl, name) {
  const { data: html } = await axios.get(pageUrl, { timeout: 20000, headers: { 'User-Agent': UA } });
  const $ = cheerio.load(html);
  let href = $('a[href*="dl.dafont.com/dl/"]').attr('href') || $('a.dl').attr('href');
  if (!href) throw new Error('DaFont download link not found.');
  if (href.startsWith('//')) href = 'https:' + href;
  if (href.startsWith('/')) href = DA + href;
  return downloadUrl(href, `dafont_${name.replace(/\s+/g, '_')}.zip`);
}

async function sendFile(m, conn, filePath, fileName, mimetype, caption) {
  try {
    await conn.sendMessage(m.chat, { document: fs.readFileSync(filePath), mimetype, fileName, caption }, { quoted: m });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

function listText(title, items) {
  return `${title}\n\n${items.map((f, i) => `${i + 1}. *${f.family || f.name}*${f.category ? ` — ${f.category}` : ''}`).join('\n')}\n\nUse *-font dl <name>* or *-fd 1,3*.`;
}

function menu() {
  return `╭━━━〔 🔤 FONT MENU 〕━━━╮\n` +
`┃\n` +
`┃ 〔 GOOGLE FONTS 〕\n` +
`┃ -font random\n` +
`┃ -font urdu\n` +
`┃ -font language <language>\n` +
`┃ -font name <font> [style] [size]\n` +
`┃ -font search <name>\n` +
`┃ -font styles <name>\n` +
`┃\n` +
`┃ Style: regular | italic | light | medium\n` +
`┃        semibold | bold | black\n` +
`┃ Size: 10–96px (preview/metadata)\n` +
`┃\n` +
`┃ 〔 FONT SEARCH / DOWNLOAD 〕\n` +
`┃ -font random\n` +
`┃ -font random arabic\n` +
`┃ -font search <name>\n` +
`┃ -font find <name>\n` +
`┃ -font dl <name>\n` +
`┃ -font info <name>\n` +
`┃\n` +
`┃ 〔 TYPES / THEMES 〕\n` +
`┃ -font types\n` +
`┃ -font type <type>\n` +
`┃ -font theme <type>\n` +
`┃\n` +
`┃ 〔 LANGUAGES 〕\n` +
`┃ -font lang arabic\n` +
`┃ -font lang chinese\n` +
`┃ -font lang japanese\n` +
`┃ -font lang russian\n` +
`┃ -font lang greek\n` +
`┃ -font lang urdu\n` +
`┃\n` +
`┃ 〔 URDU FONTS 〕\n` +
`┃ -font urdu\n` +
`┃ -font urdu random\n` +
`┃ -font urdu <font name>\n` +
`┃\n` +
`┃ 〔 LICENSE 〕\n` +
`┃ -font license free\n` +
`┃ -font license personal\n` +
`┃ -font license pd\n` +
`┃ -font license donation\n` +
`┃ -font license shareware\n` +
`┃ -font license demo\n` +
`┃\n` +
`┃ 〔 SELECTED DOWNLOADS 〕\n` +
`┃ -fd 1\n` +
`┃ -fd 1,3,5\n` +
`┃ -fd all\n` +
`┃\n` +
`╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
}

async function handler(m, { conn, text, command }) {
  const args = text?.trim() ? text.trim().split(/\s+/) : [];
  const sub = (args[0] || '').toLowerCase();
  try {
    if (command === 'fontmenu' || !sub || sub === 'menu' || sub === 'help') return m.reply(menu());

    if (sub === 'google') {
      const action = (args[1] || '').toLowerCase();
      if (!action) {
        const fonts = await googleList({ type: 'google' });
        const out = fonts.slice(0, 20); remember(m.chat, out);
        return m.reply(listText('🌐 *Google Fonts*', out));
      }
      if (action === 'search' || action === 'find') {
        const q = args.slice(2).join(' ');
        if (!q) return m.reply('Usage: -font google search <name>');
        const out = await googleSearch(q); remember(m.chat, out);
        return m.reply(listText(`🔎 *Google Fonts: ${q}*`, out));
      }
      if (action === 'random') {
        const out = await googleList({ type: 'google' });
        const f = out[Math.floor(Math.random() * out.length)];
        remember(m.chat, [f]);
        return m.reply(`🎲 *Google Font*\n\n*${f.family}*\nCategory: ${f.category}\nSubsets: ${(f.subsets || []).join(', ')}\n\nUse: -font google dl ${f.family}`);
      }
      if (action === 'lang') {
        const lang = (args[2] || '').toLowerCase();
        const subset = LANG_MAP[lang] || lang;
        const out = await googleFilterBySubset(subset); remember(m.chat, out);
        return m.reply(listText(`🌐 *Google ${lang.toUpperCase()} Fonts*`, out));
      }
      if (action === 'info') {
        const name = args.slice(2).join(' ');
        const f = await googleInfo(name);
        if (!f) return m.reply(`❌ Google font not found: ${name}`);
        return m.reply(`ℹ️ *${f.family}*\nCategory: ${f.category}\nSubsets: ${(f.subsets || []).join(', ')}\nWeights: ${(f.weights || []).join(', ')}\nStyles: ${(f.styles || []).join(', ')}\nID: ${f.id}`);
      }
      if (action === 'dl') {
        const name = args.slice(2).join(' ');
        const f = await googleInfo(name);
        if (!f) return m.reply(`❌ Google font not found: ${name}`);
        const url = fontsourceUrl(f, 'ttf');
        if (!url) return m.reply('❌ No downloadable TTF variant was returned by Fontsource.');
        const dl = await downloadUrl(url, `${f.id}.ttf`);
        return sendFile(m, conn, dl.filePath, dl.fileName, 'font/ttf', `✅ Google Font: ${f.family}`);
      }
      return m.reply('Usage: -font google [search|random|dl|info|lang] ...');
    }

    // Google Fonts canonical commands (without the "google" prefix)
    if (sub === 'language' || sub === 'lang') {
      const lang = (args[1] || '').toLowerCase();
      if (!lang) return m.reply('Usage: -font language <language>');
      const subset = LANG_MAP[lang] || lang;
      const out = await googleFilterBySubset(subset, 10);
      remember(m.chat, out);
      return m.reply(listText(`🌐 *Google ${lang.toUpperCase()} Fonts*`, out));
    }

    if (sub === 'styles') {
      const name = args.slice(1).join(' ');
      if (!name) return m.reply('Usage: -font styles <name>');
      const f = await googleInfo(name);
      if (!f) return m.reply(`❌ Google font not found: ${name}`);
      return m.reply(`🎨 *${f.family} Styles*\n\n${(f.styles || []).join(' | ')}\n\nWeights: ${(f.weights || []).join(', ')}`);
    }

    if (sub === 'name') {
      const name = args[1];
      if (!name) return m.reply('Usage: -font name <font> [style] [size]');
      const style = (args[2] || 'regular').toLowerCase();
      const size = Number(args[3] || 16);
      if (!Number.isFinite(size) || size < 10 || size > 96) return m.reply('❌ Size must be between 10 and 96px.');
      const f = await googleInfo(name);
      if (!f) return m.reply(`❌ Google font not found: ${name}`);
      return m.reply(`🔤 *${f.family}*\nStyle: ${style}\nPreview size: ${size}px\nCategory: ${f.category}\nWeights: ${(f.weights || []).join(', ')}\nStyles: ${(f.styles || []).join(', ')}\n\nDownload: -font dl ${f.family}`);
    }

    if (sub === 'random') {
      const q = args[1]?.toLowerCase();
      const out = q ? await googleFilterBySubset(LANG_MAP[q] || q, 20) : await googleList({ type: 'google' });
      if (!out.length) return m.reply('❌ No matching random fonts found.');
      const f = out[Math.floor(Math.random() * out.length)];
      remember(m.chat, [f]);
      return m.reply(`🎲 *Random Font*\n\n*${f.family}*\nCategory: ${f.category}\nSubsets: ${(f.subsets || []).join(', ')}\n\nUse: -font dl ${f.family}`);
    }

    if (sub === 'search' || sub === 'find') {
      const q = args.slice(1).join(' ');
      if (!q) return m.reply('Usage: -font search <name>');
      const out = await googleSearch(q, 8);
      if (!out.length) {
        const da = await scrapeDaFont(q); remember(m.chat, da);
        return m.reply(listText(`🔎 *DaFont Results: ${q}*`, da));
      }
      remember(m.chat, out);
      return m.reply(listText(`🔎 *Google Font Results: ${q}*`, out));
    }

    if (sub === 'dl') {
      const name = args.slice(1).join(' ');
      if (!name) return m.reply('Usage: -font dl <name>');
      const g = await googleInfo(name);
      if (g) {
        const url = fontsourceUrl(g, 'ttf');
        if (url) {
          const dl = await downloadUrl(url, `${g.id}.ttf`);
          return sendFile(m, conn, dl.filePath, dl.fileName, 'font/ttf', `✅ Google Font: ${g.family}`);
        }
      }
      const da = await scrapeDaFont(name);
      if (!da.length) return m.reply(`❌ Font not found: ${name}`);
      const dl = await downloadDaFont(da[0].pageUrl, da[0].name);
      return sendFile(m, conn, dl.filePath, dl.fileName, 'application/zip', `✅ DaFont: ${da[0].name}`);
    }

    if (sub === 'info') {
      const name = args.slice(1).join(' ');
      const f = await googleInfo(name);
      if (f) return m.reply(`ℹ️ *${f.family}*\nSource: Google Fonts\nCategory: ${f.category}\nSubsets: ${(f.subsets || []).join(', ')}\nWeights: ${(f.weights || []).join(', ')}\nStyles: ${(f.styles || []).join(', ')}\nID: ${f.id}`);
      const da = await scrapeDaFont(name);
      if (!da.length) return m.reply(`❌ Font not found: ${name}`);
      return m.reply(`ℹ️ *${da[0].name}*\nSource: DaFont\nPage: ${da[0].pageUrl}`);
    }

    if (sub === 'types') {
      return m.reply(`📂 *FONT TYPES*\n\n• sans-serif\n• serif\n• display\n• handwriting\n• monospace\n\nExample: -font type handwriting`);
    }

    if (sub === 'type' || sub === 'theme') {
      const type = args.slice(1).join(' ').toLowerCase();
      if (!type) return m.reply('Usage: -font type <type>');
      const out = await googleFilterByCategory(type, 10);
      remember(m.chat, out);
      return m.reply(listText(`📂 *${type.toUpperCase()} Fonts*`, out));
    }

    if (sub === 'lang') {
      const lang = (args[1] || '').toLowerCase();
      if (!lang) return m.reply('Usage: -font lang arabic');
      const out = await googleFilterBySubset(LANG_MAP[lang] || lang, 10);
      remember(m.chat, out);
      return m.reply(listText(`🌐 *${lang.toUpperCase()} Fonts*`, out));
    }

    if (sub === 'urdu') {
      const name = args.slice(1).join(' ').toLowerCase();
      if (!name) {
        const out = Object.entries(URDU_FONTS).map(([key, value]) => ({ name: key, ...value }));
        remember(m.chat, out);
        return m.reply(`📖 *URDU FONTS*\n\n${out.map((f, i) => `${i + 1}. *${f.name}* — ${f.type}`).join('\n')}\n\nUse: -font urdu <font name> or -font urdu random`);
      }
      if (name === 'random') {
        const keys = Object.keys(URDU_FONTS);
        const key = keys[Math.floor(Math.random() * keys.length)];
        const f = URDU_FONTS[key];
        const dl = await downloadUrl(f.url, `urdu_${key}.${f.ext}`);
        return sendFile(m, conn, dl.filePath, dl.fileName, `font/${f.ext}`, `✅ Urdu Font: ${key}`);
      }
      const key = Object.keys(URDU_FONTS).find(k => k === name || k.replace(/-/g, ' ') === name);
      if (!key) return m.reply('❌ Urdu font not found. Use -font urdu');
      const f = URDU_FONTS[key];
      const dl = await downloadUrl(f.url, `urdu_${key}.${f.ext}`);
      return sendFile(m, conn, dl.filePath, dl.fileName, `font/${f.ext}`, `✅ Urdu Font: ${key}`);
    }

    if (sub === 'license') {
      const license = (args[1] || '').toLowerCase();
      if (!LICENSE_HELP[license]) return m.reply(`📜 *LICENSE OPTIONS*\n\n${Object.entries(LICENSE_HELP).map(([k,v]) => `• ${k} — ${v}`).join('\n')}`);
      if (license === 'free' || license === 'pd') {
        const out = await googleList({ type: 'google' });
        remember(m.chat, out.slice(0, 10));
        return m.reply(`📜 *${license.toUpperCase()} LICENSE FONTS*\n\nGoogle Fonts are distributed under open licenses; the Google Fonts repository notes that most use SIL OFL 1.1, with some Apache 2 and Ubuntu Font License fonts.\n\n${out.slice(0,10).map((f,i)=>`${i+1}. *${f.family}*`).join('\n')}\n\nAlways verify the license of the specific family before redistribution.`);
      }
      return m.reply(`📜 *${license.toUpperCase()}*\n\n${LICENSE_HELP[license]}\n\nFor DaFont, verify the license shown on the individual font page before downloading/redistributing.`);
    }

    return m.reply(menu());
  } catch (err) {
    console.error('[FontPlugin]', err);
    return m.reply(`❌ Font error: ${err.message || 'request failed'}`);
  }
}

async function downloadSelected(m, { conn, text }) {
  const raw = text?.trim().toLowerCase();
  const saved = getRemembered(m.chat);
  if (!saved.length) return m.reply('⚠️ No font list is saved for this chat. Run -font search/list first.');
  if (!raw) return m.reply('Usage: -fd 1,3,5 or -fd all');
  const indexes = raw === 'all' ? saved.map((_, i) => i) : raw.split(/[ ,]+/).flatMap(x => x.split(',')).map(Number).filter(n => Number.isInteger(n) && n > 0).map(n => n - 1);
  if (!indexes.length) return m.reply('❌ Invalid selection. Example: -fd 1,3,5');
  const selected = indexes.map(i => saved[i]).filter(Boolean).slice(0, 10);
  if (!selected.length) return m.reply('❌ No valid font numbers selected.');
  for (const f of selected) {
    try {
      if (f.id) {
        const info = await googleInfo(f.family);
        const url = fontsourceUrl(info, 'ttf');
        if (!url) continue;
        const dl = await downloadUrl(url, `${f.id}.ttf`);
        await sendFile(m, conn, dl.filePath, dl.fileName, 'font/ttf', `✅ ${f.family}`);
      } else if (f.pageUrl) {
        const dl = await downloadDaFont(f.pageUrl, f.name);
        await sendFile(m, conn, dl.filePath, dl.fileName, 'application/zip', `✅ ${f.name}`);
      } else if (f.url) {
        const dl = await downloadUrl(f.url, `urdu_${f.name}.${f.ext}`);
        await sendFile(m, conn, dl.filePath, dl.fileName, `font/${f.ext}`, `✅ ${f.name}`);
      }
    } catch (e) {
      await m.reply(`⚠️ Failed: ${f.family || f.name || 'font'} — ${e.message}`);
    }
  }
}

handler.command = ['font', 'fontmenu'];
handler.help = ['fontmenu', 'font random', 'font random arabic', 'font search <name>', 'font find <name>', 'font dl <name>', 'font info <name>', 'font types', 'font type <type>', 'font theme <type>', 'font lang <language>', 'font urdu', 'font urdu random', 'font urdu <name>', 'font license <type>'];
handler.tags = ['downloader', 'fonts'];
handler.limit = true;

export { downloadSelected };
export default handler;
