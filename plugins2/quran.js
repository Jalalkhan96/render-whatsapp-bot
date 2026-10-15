/**
 * ABIX Quran Web Scraper
 *
 * Sources (public webpages/files; no Quran API key required):
 * - Quran.com: verse text, localized translations, search pages
 * - Tanzil.net: translation catalog / attribution reference
 * - EveryAyah.com: ayah-by-ayah MP3 recitations
 *
 * Commands: -quranmenu, -quran, -ayah, -surah, -quransearch,
 * -qurantrans, -qurantranslations, -quranaudio, -surahaudio,
 * -quranreciters, -quranword, -quransources, -quranstatus
 */

const axios = require('axios');
const cheerio = require('cheerio');

const QURAN_HOME = 'https://quran.com';
const TANZIL_TRANSLATIONS = 'https://tanzil.net/trans/';
const TANZIL_DEEP = 'https://tanzil.net/#';
const EVERY_AYAH_RECITATIONS = 'https://everyayah.com/recitations_ayat.html';
const EVERY_AYAH_PAGES = 'https://everyayah.com/recitations_pages.html';
const QURAN_SEARCH = 'https://quran.com/search';
const UA = 'ABIX-Quran-Scraper/1.0 (+https://quran.com/)';
const HTTP_TIMEOUT = 15000;
const MAX_HTML = 5 * 1024 * 1024;

const SURAHES = [
  { id: 1, name: 'Al-Fatihah', slug: 'al-fatihah' },
  { id: 2, name: 'Al-Baqarah', slug: 'al-baqarah' },
  { id: 3, name: 'Ali Imran', slug: 'ali-imran' },
  { id: 4, name: 'An-Nisa', slug: 'an-nisa' },
  { id: 5, name: 'Al-Ma’idah', slug: 'al-maidah' },
  { id: 6, name: 'Al-An’am', slug: 'al-anam' },
  { id: 7, name: 'Al-A’raf', slug: 'al-araf' },
  { id: 8, name: 'Al-Anfal', slug: 'al-anfal' },
  { id: 9, name: 'At-Tawbah', slug: 'at-tawbah' },
  { id: 10, name: 'Yunus', slug: 'yunus' },
  { id: 11, name: 'Hud', slug: 'hud' },
  { id: 12, name: 'Yusuf', slug: 'yusuf' },
  { id: 13, name: 'Ar-Ra’d', slug: 'ar-rad' },
  { id: 14, name: 'Ibrahim', slug: 'ibrahim' },
  { id: 15, name: 'Al-Hijr', slug: 'al-hijr' },
  { id: 16, name: 'An-Nahl', slug: 'an-nahl' },
  { id: 17, name: 'Al-Isra', slug: 'al-isra' },
  { id: 18, name: 'Al-Kahf', slug: 'al-kahf' },
  { id: 19, name: 'Maryam', slug: 'maryam' },
  { id: 20, name: 'Ta-Ha', slug: 'ta-ha' },
  { id: 21, name: 'Al-Anbiya', slug: 'al-anbiya' },
  { id: 22, name: 'Al-Hajj', slug: 'al-hajj' },
  { id: 23, name: 'Al-Mu’minun', slug: 'al-muminun' },
  { id: 24, name: 'An-Nur', slug: 'an-nur' },
  { id: 25, name: 'Al-Furqan', slug: 'al-furqan' },
  { id: 26, name: 'Ash-Shu’ara', slug: 'ash-shuara' },
  { id: 27, name: 'An-Naml', slug: 'an-naml' },
  { id: 28, name: 'Al-Qasas', slug: 'al-qasas' },
  { id: 29, name: 'Al-Ankabut', slug: 'al-ankabut' },
  { id: 30, name: 'Ar-Rum', slug: 'ar-rum' },
  { id: 31, name: 'Luqman', slug: 'luqman' },
  { id: 32, name: 'As-Sajdah', slug: 'as-sajdah' },
  { id: 33, name: 'Al-Ahzab', slug: 'al-ahzab' },
  { id: 34, name: 'Saba', slug: 'saba' },
  { id: 35, name: 'Fatir', slug: 'fatir' },
  { id: 36, name: 'Ya-Sin', slug: 'ya-sin' },
  { id: 37, name: 'As-Saffat', slug: 'as-saffat' },
  { id: 38, name: 'Sad', slug: 'sad' },
  { id: 39, name: 'Az-Zumar', slug: 'az-zumar' },
  { id: 40, name: 'Ghafir', slug: 'ghafir' },
  { id: 41, name: 'Fussilat', slug: 'fussilat' },
  { id: 42, name: 'Ash-Shura', slug: 'ash-shura' },
  { id: 43, name: 'Az-Zukhruf', slug: 'az-zukhruf' },
  { id: 44, name: 'Ad-Dukhan', slug: 'ad-dukhan' },
  { id: 45, name: 'Al-Jathiyah', slug: 'al-jathiyah' },
  { id: 46, name: 'Al-Ahqaf', slug: 'al-ahqaf' },
  { id: 47, name: 'Muhammad', slug: 'muhammad' },
  { id: 48, name: 'Al-Fath', slug: 'al-fath' },
  { id: 49, name: 'Al-Hujurat', slug: 'al-hujurat' },
  { id: 50, name: 'Qaf', slug: 'qaf' },
  { id: 51, name: 'Adh-Dhariyat', slug: 'adh-dhariyat' },
  { id: 52, name: 'At-Tur', slug: 'at-tur' },
  { id: 53, name: 'An-Najm', slug: 'an-najm' },
  { id: 54, name: 'Al-Qamar', slug: 'al-qamar' },
  { id: 55, name: 'Ar-Rahman', slug: 'ar-rahman' },
  { id: 56, name: 'Al-Waqi’ah', slug: 'al-waqiah' },
  { id: 57, name: 'Al-Hadid', slug: 'al-hadid' },
  { id: 58, name: 'Al-Mujadilah', slug: 'al-mujadilah' },
  { id: 59, name: 'Al-Hashr', slug: 'al-hashr' },
  { id: 60, name: 'Al-Mumtahanah', slug: 'al-mumtahanah' },
  { id: 61, name: 'As-Saff', slug: 'as-saff' },
  { id: 62, name: 'Al-Jumu’ah', slug: 'al-jumua' },
  { id: 63, name: 'Al-Munafiqun', slug: 'al-munafiqun' },
  { id: 64, name: 'At-Taghabun', slug: 'at-taghabun' },
  { id: 65, name: 'At-Talaq', slug: 'at-talaq' },
  { id: 66, name: 'At-Tahrim', slug: 'at-tahrim' },
  { id: 67, name: 'Al-Mulk', slug: 'al-mulk' },
  { id: 68, name: 'Al-Qalam', slug: 'al-qalam' },
  { id: 69, name: 'Al-Haqqah', slug: 'al-haqqah' },
  { id: 70, name: 'Al-Ma’arij', slug: 'al-maarij' },
  { id: 71, name: 'Nuh', slug: 'nuh' },
  { id: 72, name: 'Al-Jinn', slug: 'al-jinn' },
  { id: 73, name: 'Al-Muzzammil', slug: 'al-muzzammil' },
  { id: 74, name: 'Al-Muddaththir', slug: 'al-muddaththir' },
  { id: 75, name: 'Al-Qiyamah', slug: 'al-qiyamah' },
  { id: 76, name: 'Al-Insan', slug: 'al-insan' },
  { id: 77, name: 'Al-Mursalat', slug: 'al-mursalat' },
  { id: 78, name: 'An-Naba', slug: 'an-naba' },
  { id: 79, name: 'An-Nazi’at', slug: 'an-naziat' },
  { id: 80, name: 'Abasa', slug: 'abasa' },
  { id: 81, name: 'At-Takwir', slug: 'at-takwir' },
  { id: 82, name: 'Al-Infitar', slug: 'al-infitar' },
  { id: 83, name: 'Al-Mutaffifin', slug: 'al-mutaffifin' },
  { id: 84, name: 'Al-Inshiqaq', slug: 'al-inshiqaq' },
  { id: 85, name: 'Al-Buruj', slug: 'al-buruj' },
  { id: 86, name: 'At-Tariq', slug: 'at-tariq' },
  { id: 87, name: 'Al-A’la', slug: 'al-ala' },
  { id: 88, name: 'Al-Ghashiyah', slug: 'al-ghashiyah' },
  { id: 89, name: 'Al-Fajr', slug: 'al-fajr' },
  { id: 90, name: 'Al-Balad', slug: 'al-balad' },
  { id: 91, name: 'Ash-Shams', slug: 'ash-shams' },
  { id: 92, name: 'Al-Layl', slug: 'al-layl' },
  { id: 93, name: 'Ad-Duha', slug: 'ad-duha' },
  { id: 94, name: 'Ash-Sharh', slug: 'ash-sharh' },
  { id: 95, name: 'At-Tin', slug: 'at-tin' },
  { id: 96, name: 'Al-Alaq', slug: 'al-alaq' },
  { id: 97, name: 'Al-Qadr', slug: 'al-qadr' },
  { id: 98, name: 'Al-Bayyinah', slug: 'al-bayyinah' },
  { id: 99, name: 'Az-Zalzalah', slug: 'az-zalzalah' },
  { id: 100, name: 'Al-Adiyat', slug: 'al-adiyat' },
  { id: 101, name: 'Al-Qari’ah', slug: 'al-qariah' },
  { id: 102, name: 'At-Takathur', slug: 'at-takathur' },
  { id: 103, name: 'Al-Asr', slug: 'al-asr' },
  { id: 104, name: 'Al-Humazah', slug: 'al-humazah' },
  { id: 105, name: 'Al-Fil', slug: 'al-fil' },
  { id: 106, name: 'Quraysh', slug: 'quraysh' },
  { id: 107, name: 'Al-Ma’un', slug: 'al-maun' },
  { id: 108, name: 'Al-Kawthar', slug: 'al-kawthar' },
  { id: 109, name: 'Al-Kafirun', slug: 'al-kafirun' },
  { id: 110, name: 'An-Nasr', slug: 'an-nasr' },
  { id: 111, name: 'Al-Masad', slug: 'al-masad' },
  { id: 112, name: 'Al-Ikhlas', slug: 'al-ikhlas' },
  { id: 113, name: 'Al-Falaq', slug: 'al-falaq' },
  { id: 114, name: 'An-Nas', slug: 'an-nas' },
];

const SURAH_BY_ID = new Map(SURAHES.map(s => [s.id, s]));
const SURAH_BY_NAME = new Map(SURAHES.flatMap(s => [[s.name.toLowerCase(), s], [s.slug, s], [s.name.replace(/^Al-/, '').toLowerCase(), s]]));

const RECITERS = {
  'alafasy': { name: 'Mishary Rashid Alafasy', folder: 'Alafasy_128kbps' },
  'alafasi': { name: 'Mishary Rashid Alafasy', folder: 'Alafasy_128kbps' },
  'sudais': { name: 'Abdul Rahman Al-Sudais', folder: 'Abdurrahmaan_As-Sudais_64kbps' },
  'basit': { name: 'Abdul Basit Murattal', folder: 'Abdul_Basit_Murattal_128kbps' },
  'husary': { name: 'Mahmoud Khalil Al-Husary', folder: 'Husary_128kbps' },
  'ghamadi': { name: 'Saad Al-Ghamdi', folder: 'Ghamadi_40kbps' },
};

function norm(value) { return String(value || '').trim().toLowerCase(); }
function prefixFor(context) { return context?.prefix || (context?.rawText?.trim()?.[0]) || '-'; }
function safeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHtml(url) {
  const response = await axios.get(url, { timeout: HTTP_TIMEOUT, maxContentLength: MAX_HTML, maxBodyLength: MAX_HTML, responseType: 'text', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' } });
  if (typeof response.data !== 'string') throw new Error('Unexpected HTML response');
  return response.data;
}

function localeInfo(locale) {
  const value = norm(locale || 'en');
  const aliases = { english:'en', en:'en', urdu:'ur', ur:'ur', arabic:'ar', ar:'ar', pashto:'ps', ps:'ps', hindi:'hi', hi:'hi', bengali:'bn', bn:'bn', indonesian:'id', id:'id', french:'fr', fr:'fr', spanish:'es', es:'es', turkish:'tr', tr:'tr' };
  return aliases[value] || value || 'en';
}

function resolveSurah(input) {
  const value = norm(input).replace(/[’']/g, '’');
  if (/^\d{1,3}$/.test(value)) return SURAH_BY_ID.get(Number(value)) || null;
  return SURAH_BY_NAME.get(value) || null;
}

function parseReference(args = [], mode = 'verse') {
  const a = args.map(v => String(v || '').trim()).filter(Boolean);
  if (!a.length) return null;
  let token = a[0];
  let m = token.match(/^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
  if (m) return { surah: Number(m[1]), verse: Number(m[2]), endVerse: m[3] ? Number(m[3]) : Number(m[2]) };
  if (/^\d{1,3}$/.test(token) && a[1] && /^\d{1,3}$/.test(a[1])) return { surah: Number(token), verse: Number(a[1]), endVerse: Number(a[1]) };
  const surah = resolveSurah(token);
  if (surah && mode === 'surah') return { surah: surah.id, verse: 1, endVerse: 1 };
  return null;
}

function quranUrl(surah, verse, locale = 'en') {
  const meta = SURAH_BY_ID.get(Number(surah));
  const loc = localeInfo(locale);
  if (!meta) throw new Error('Invalid Surah number. Use 1-114.');
  return loc === 'en' ? `${QURAN_HOME}/${meta.slug}/${verse}` : `${QURAN_HOME}/${loc}/${meta.slug}/${verse}`;
}

function tanzilUrl(surah, verse, translationId = 'en.sahih') {
  return `${TANZIL_DEEP}/trans/${encodeURIComponent(translationId)}/${Number(surah)}:${Number(verse)}`;
}

function everyAyahUrl(surah, verse, reciter = 'alafasy') {
  const r = RECITERS[norm(reciter)] || RECITERS.alafasy;
  const s = String(Number(surah)).padStart(3, '0');
  const a = String(Number(verse)).padStart(3, '0');
  return `https://everyayah.com/data/${r.folder}/${s}${a}.mp3`;
}

function mp3QuranSurahUrl(surah) {
  const s = String(Number(surah)).padStart(3, '0');
  return `https://server8.mp3quran.net/afs/${s}.mp3`;
}

function extractVerseBlocks(html) {
  const $ = cheerio.load(html);
  const out = [];
  const selectors = ['div[class^=TranslationView_container]', 'div[class*=TranslationView_container]'];
  let nodes = $();
  for (const selector of selectors) { nodes = $(selector); if (nodes.length) break; }
  nodes.each((_, node) => {
    const $node = $(node);
    const text = safeText($node.text());
    const keyMatch = text.match(/\b(\d{1,3}):(\d{1,3})\b/);
    if (!keyMatch) return;
    const key = `${keyMatch[1]}:${keyMatch[2]}`;
    let arabic = safeText($node.find('div[class^=SeoText] div:last-of-type, div[class*=SeoText] div:last-of-type').first().text());
    let translation = safeText($node.find('div[class^=TranslationText], div[class*=TranslationText]').first().text());
    if (!arabic) {
      const candidates = $node.find('div').toArray().map(el => safeText($(el).text())).filter(t => /[\u0600-\u06FF]/.test(t));
      arabic = candidates.sort((a,b) => b.length - a.length)[0] || '';
    }
    if (!translation) {
      const candidates = $node.find('div').toArray().map(el => safeText($(el).text())).filter(t => t && !/[\u0600-\u06FF]/.test(t) && t.length > 8);
      translation = candidates.sort((a,b) => a.length - b.length)[0] || '';
    }
    out.push({ key, arabic, translation });
  });
  return Array.from(new Map(out.map(x => [x.key, x])).values());
}

function fallbackVerseFromBody(html, verseKey) {
  const $ = cheerio.load(html);
  const body = safeText($('body').text());
  const index = body.indexOf(verseKey);
  if (index < 0) return null;
  const after = body.slice(index, index + 1800);
  const snippets = after.split(/(?=\b\d{1,3}:\d{1,3}\b)/).filter(Boolean);
  const hit = snippets.find(s => s.includes(verseKey)) || after;
  const arabicParts = hit.match(/[\u0600-\u06FF][\u0600-\u06FF\u0650-\u06FF\s،؟؛,.!?ۖۗۚۛۙۚۜ۩]+/g) || [];
  const nonArabic = hit.replace(/[\u0600-\u06FF\u064B-\u065F\u0670-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
  return { key: verseKey, arabic: safeText(arabicParts.sort((a,b)=>b.length-a.length)[0] || ''), translation: nonArabic.slice(0, 900) };
}

async function scrapeQuranVerse(surah, verse, locale = 'en') {
  const url = quranUrl(surah, verse, locale);
  const html = await fetchHtml(url);
  const target = `${Number(surah)}:${Number(verse)}`;
  const blocks = extractVerseBlocks(html);
  const exact = blocks.find(x => x.key === target);
  const result = exact || fallbackVerseFromBody(html, target);
  if (!result || (!result.arabic && !result.translation)) throw new Error('Quran.com page format changed; no verse data could be extracted.');
  return { ...result, url, locale: localeInfo(locale) };
}

async function scrapeQuranSearch(query) {
  const url = `${QURAN_SEARCH}?page=1&q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const results = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/^\/(\d{1,3})\/(\d{1,3})(?:$|[?#])/);
    if (!m) return;
    const text = safeText($(a).text());
    const key = `${m[1]}:${m[2]}`;
    if (!results.some(r => r.key === key)) results.push({ key, text: text || key, url: `${QURAN_HOME}${href}` });
  });
  return { query, url, results: results.slice(0, 10) };
}

async function scrapeTanzilTranslations(filter = '') {
  const html = await fetchHtml(TANZIL_TRANSLATIONS);
  const $ = cheerio.load(html);
  const needle = norm(filter);
  const rows = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('th,td').toArray().map(el => safeText($(el).text()));
    if (cells.length >= 3 && !/^language$/i.test(cells[0])) {
      const row = { language: cells[0], name: cells[1], translator: cells[2] };
      if (!needle || `${row.language} ${row.name} ${row.translator}`.toLowerCase().includes(needle)) rows.push(row);
    }
  });
  return rows.slice(0, 30);
}

async function scrapeEveryAyahReciters() {
  const html = await fetchHtml(EVERY_AYAH_PAGES);
  const $ = cheerio.load(html);
  const found = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = safeText($(a).text());
    if (!/kbps|mp3/i.test(`${href} ${text}`)) return;
    if (/Page Mp3s/i.test(text) || /recitations/i.test(href)) found.push(text.replace(/\s*\(Page Mp3s\).*$/i, '').trim());
  });
  const unique = [...new Set(found)].filter(Boolean);
  return unique.length ? unique.slice(0, 40) : Object.values(RECITERS).map(r => r.name);
}

async function scrapeQuranWord(surah, verse) {
  const url = `https://corpus.quran.com/wordbyword.jsp?chapter=${Number(surah)}&verse=${Number(verse)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const rows = [];
  $('table').first().find('tr').each((_, tr) => {
    const cells = $(tr).find('td').toArray().map(el => safeText($(el).text())).filter(Boolean);
    if (cells.length >= 2) rows.push(cells.slice(0, 3));
  });
  return { url, rows: rows.slice(0, 40) };
}

async function statusUrl(url) {
  try { const response = await axios.get(url, { timeout: 8000, maxContentLength: 200000, responseType: 'text', headers: { 'User-Agent': UA } }); return { ok: response.status >= 200 && response.status < 400, status: response.status }; } catch (error) { return { ok: false, error: error.code || error.message }; }
}

function menu(prefix) {
  return [
    '╭━━━〔 📖 ABIX QURAN 〕━━━╮',
    '┃',
    '┃ 📜 Quran text + translation scraper',
    '┃ 🎧 Ayah & Surah audio',
    '┃ 🔎 Quran search',
    '┃ 🌐 Multiple languages',
    '┃',
    `┃ 📖 ${prefix}quran 2:255`,
    `┃ 🕌 ${prefix}ayah 36:1`,
    `┃ 📚 ${prefix}surah 36`,
    `┃ 🌍 ${prefix}qurantrans 2:255 ur`,
    `┃ 🔎 ${prefix}quransearch mercy`,
    `┃ 🎧 ${prefix}quranaudio 1:1`,
    `┃ 🎧 ${prefix}quranaudio 1:1 sudais`,
    `┃ 🔊 ${prefix}surahaudio 36`,
    `┃ 👤 ${prefix}quranreciters`,
    `┃ 📋 ${prefix}qurantranslations urdu`,
    `┃ 🧩 ${prefix}quranword 1:1`,
    `┃ 🔗 ${prefix}quransources 2:255`,
    `┃ ❤️ ${prefix}quranstatus`,
    '┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
  ].join('\n');
}

function renderVerse(data, sourceLabel = 'Quran.com') {
  return `📖 *${data.key}*\n\n${data.arabic || 'Arabic text unavailable'}\n\n📝 *Translation (${data.locale || 'en'})*\n${data.translation || 'Translation unavailable'}\n\n🔗 ${data.url}\n📚 Source: ${sourceLabel}`;
}

function parseCommand(context) {
  const raw = String(context?.messageText || context?.rawText || '').trim();
  const prefix = prefixFor(context);
  const body = raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;
  const parts = body.split(/\s+/).filter(Boolean);
  return { command: norm(parts.shift()), args: parts };
}

async function send(sock, jid, text, message) { return sock.sendMessage(jid, { text }, message ? { quoted: message } : undefined); }

module.exports = {
  command: 'quran',
  aliases: [
    'quranmenu',
    'ayah',
    'surah',
    'quransearch',
    'qurantrans',
    'qurantranslations',
    'quranaudio',
    'surahaudio',
    'quranreciters',
    'quranword',
    'quransources',
    'quranstatus',
  ],
  category: 'quran',
  description: 'Live Quran text, translations, search and audio scraping from public sources',
  async handler(sock, message, args = [], context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    if (!jid) return;
    const parsed = parseCommand(context);
    const command = parsed.command || 'quran';
    const input = parsed.args.length ? parsed.args : args;
    const prefix = prefixFor(context);
    try {
      if (command === 'quranmenu' || command === 'quran') {
        if (!input.length) return send(sock, jid, menu(prefix), message);
      }
      if (command === 'quranstatus') {
        const [q, t, e, c] = await Promise.all([statusUrl(QURAN_HOME), statusUrl(TANZIL_TRANSLATIONS), statusUrl(EVERY_AYAH_PAGES), statusUrl('https://corpus.quran.com/')]);
        return send(sock, jid, `📊 *Quran sources status*\n\nQuran.com: ${q.ok ? '✅' : '❌'} ${q.status || q.error || ''}\nTanzil: ${t.ok ? '✅' : '❌'} ${t.status || t.error || ''}\nEveryAyah: ${e.ok ? '✅' : '❌'} ${e.status || e.error || ''}\nQuranic Arabic Corpus: ${c.ok ? '✅' : '❌'} ${c.status || c.error || ''}`, message);
      }
      if (command === 'quransources') {
        const ref = parseReference(input, 'verse');
        if (!ref) return send(sock, jid, `❌ Use ${prefix}quransources 2:255`, message);
        return send(sock, jid, `🔗 *Quran sources for ${ref.surah}:${ref.verse}*\n\nQuran.com: ${quranUrl(ref.surah, ref.verse)}\nTanzil: ${tanzilUrl(ref.surah, ref.verse)}\nEveryAyah: ${everyAyahUrl(ref.surah, ref.verse)}\n\nSources are fetched/displayed on demand; no full Quran database is stored on disk.`, message);
      }
      if (command === 'qurantranslations') {
        const rows = await scrapeTanzilTranslations(input.join(' '));
        if (!rows.length) return send(sock, jid, '❌ No matching translations found.', message);
        const text = rows.map((r, i) => `${i + 1}. ${r.language} — ${r.name} — ${r.translator}`).join('\n');
        return send(sock, jid, `📚 *Tanzil translation catalog*\n\n${text}\n\n🔗 ${TANZIL_TRANSLATIONS}`, message);
      }
      if (command === 'quranreciters') {
        const names = await scrapeEveryAyahReciters();
        return send(sock, jid, `🎧 *EveryAyah reciters*\n\n${names.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\n🔗 ${EVERY_AYAH_PAGES}`, message);
      }
      if (command === 'quransearch') {
        if (!input.length) return send(sock, jid, `❌ Use ${prefix}quransearch <word or phrase>`, message);
        const data = await scrapeQuranSearch(input.join(' '));
        if (!data.results.length) return send(sock, jid, `🔎 No Quran.com search results found for *${data.query}*.\n\n🔗 ${data.url}`, message);
        return send(sock, jid, `🔎 *Quran search: ${data.query}*\n\n${data.results.map((r,i)=>`${i+1}. ${r.key} — ${r.text}\n${r.url}`).join('\n\n')}`, message);
      }
      if (command === 'quranword') {
        const ref = parseReference(input, 'verse');
        if (!ref) return send(sock, jid, `❌ Use ${prefix}quranword 1:1`, message);
        const data = await scrapeQuranWord(ref.surah, ref.verse);
        const text = data.rows.length ? data.rows.map(r => r.join(' — ')).join('\n') : 'No word rows extracted.';
        return send(sock, jid, `🧩 *Word-by-word source: ${ref.surah}:${ref.verse}*\n\n${text.slice(0, 5000)}\n\n🔗 ${data.url}`, message);
      }
      if (command === 'qurantrans') {
        const lang = localeInfo(input[1] || 'ur');
        const ref = parseReference(input, 'verse');
        if (!ref) return send(sock, jid, `❌ Use ${prefix}qurantrans 2:255 ur`, message);
        const data = await scrapeQuranVerse(ref.surah, ref.verse, lang);
        return send(sock, jid, renderVerse(data, 'Quran.com localized webpage'), message);
      }
      if (command === 'quranaudio') {
        const ref = parseReference(input, 'verse');
        if (!ref) return send(sock, jid, `❌ Use ${prefix}quranaudio 1:1 [alafasy|sudais|basit|husary|ghamadi]`, message);
        const reciterKey = norm(input.find(v => Object.prototype.hasOwnProperty.call(RECITERS, norm(v)))) || 'alafasy';
        const audioUrl = everyAyahUrl(ref.surah, ref.verse, reciterKey);
        const meta = SURAH_BY_ID.get(ref.surah);
        await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false, caption: `🎧 ${meta?.name || ref.surah} — Ayah ${ref.verse}\n👤 ${RECITERS[reciterKey].name}\n🔗 ${audioUrl}` }, { quoted: message });
        return;
      }
      if (command === 'surahaudio') {
        const surah = resolveSurah(input[0]);
        if (!surah) return send(sock, jid, `❌ Use ${prefix}surahaudio <1-114>`, message);
        const audioUrl = mp3QuranSurahUrl(surah.id);
        await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false, caption: `🔊 *${surah.name}*\n👤 Mishary Rashid Alafasy\n📚 Source: MP3Quran\n🔗 ${audioUrl}` }, { quoted: message });
        return;
      }
      if (command === 'surah') {
        const surah = resolveSurah(input[0]);
        if (!surah) return send(sock, jid, `❌ Use ${prefix}surah <1-114> or ${prefix}surah <name>`, message);
        const first = await scrapeQuranVerse(surah.id, 1, 'en');
        return send(sock, jid, `📚 *${surah.id}. ${surah.name}*\n\n🌐 ${quranUrl(surah.id, 1)}\n🎧 ${mp3QuranSurahUrl(surah.id)}\n\n${first.arabic || ''}`, message);
      }
      if (command === 'ayah' || command === 'quran') {
        const ref = parseReference(input, 'verse');
        if (!ref) return send(sock, jid, `❌ Use ${prefix}quran 2:255`, message);
        const locale = localeInfo(input.find(v => ['en','ur','ar','ps','hi','bn','id','fr','es','tr','urdu','english','arabic','pashto','hindi','bengali','indonesian','french','spanish','turkish'].includes(norm(v))) || 'en');
        const data = await scrapeQuranVerse(ref.surah, ref.verse, locale);
        return send(sock, jid, renderVerse(data), message);
      }
      return send(sock, jid, menu(prefix), message);
    } catch (error) {
      console.error('[QURAN] Command error:', error);
      return send(sock, jid, `❌ Quran request failed: ${error.message}\n\nPlease try again in a moment.`, message);
    }
  }
};
