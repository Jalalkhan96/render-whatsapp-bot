'use strict';

const scraper = require('../lib/animeImageScraper.cjs');
const browserScraper = require('../lib/browserImageScraper.cjs');

const SESSIONS = new Map();
const MAX_SESSION_MS = 5 * 60 * 1000;

const C = {
  channelName: 'ABIX-AE',
  channelUrl: 'https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07',
};

function remember(key, data) {
  SESSIONS.set(key, { at: Date.now(), data });
}
function getSession(key) {
  const s = SESSIONS.get(key);
  if (!s || Date.now() - s.at > MAX_SESSION_MS) { SESSIONS.delete(key); return null; }
  return s.data;
}
function jidOf(message) { return message?.key?.remoteJid || message?.from || message?.chat || ''; }
function text(message) { return message?.message?.conversation || message?.message?.extendedTextMessage?.text || message?.text || ''; }
async function reply(sock, message, body) { return sock.sendMessage(jidOf(message), { text: body }, { quoted: message }); }
async function sendImage(sock, message, img, caption = '') {
  return sock.sendMessage(jidOf(message), { image: { url: img }, ...(caption ? { caption } : {}) }, { quoted: message });
}
function safeSource(source) { return String(source || '').toLowerCase().replace(/[^a-z]/g, ''); }

function getAllSourceIds() {
  return [...scraper.getSources().map(x => x.id), ...browserScraper.getStockSources().map(x => x.id)];
}

async function runSource(sourceId, query, limit = 8) {
  const stock = browserScraper.STOCK_SOURCES[sourceId];
  if (stock) return browserScraper.browserSearch(sourceId, query, { limit });
  return scraper.searchSource(sourceId, query, limit);
}

async function searchAll(query, limit = 4) {
  const normal = scraper.getSources().map(x => x.id);
  const stock = browserScraper.getStockSources().map(x => x.id);
  const selected = [...normal, ...stock];
  const settled = await Promise.allSettled(selected.map(s => runSource(s, query, limit)));
  const results = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(r.value);
    else errors.push({ source: selected[i], error: r.reason?.message || String(r.reason) });
  });
  return { query, results, errors };
}

async function sendResults(sock, message, result, label) {
  const jid = jidOf(message);
  const flat = [];
  for (const block of result.results || []) {
    for (const img of block.images || []) flat.push({ ...img, sourceName: block.sourceName, source: block.source });
  }
  const unique = []; const seen = new Set();
  for (const x of flat) if (!seen.has(x.url)) { seen.add(x.url); unique.push(x); }
  if (!unique.length) {
    return reply(sock, message, `❌ No public images found for: ${label}\n\nSources checked: ${result.results?.length || 0}\nErrors: ${(result.errors || []).length}`);
  }
  const key = `${jid}:${Date.now()}`;
  remember(key, unique);
  let out = `🖼️ *PUBLIC IMAGE SCRAPER*\n\nQuery: *${label}*\nFound: ${unique.length}\n\n`;
  unique.slice(0, 12).forEach((x, i) => { out += `${i + 1}. ${x.sourceName}\n${x.url}\n`; });
  if (unique.length > 12) out += `\n…and ${unique.length - 12} more.`;
  out += `\nUse *-animeimgget ${key} 3* to send image #3.\nUse *-animeimgall ${key}* to send the first 10.\n\n${C.channelName}\n${C.channelUrl}`;
  return reply(sock, message, out);
}

module.exports = [
  {
    command: 'animeimgmenu', aliases: ['animeimagemenu', 'imgmenu', 'animimgmenu'], category: 'Anime Images',
    description: 'Show public image scraper commands',
    handler: async (sock, message) => reply(sock, message,
      `🖼️ *PUBLIC IMAGE SCRAPER*\n\n` +
      `No official API keys are required. Existing sources use public HTML; Unsplash/Pexels/Pixabay use Playwright page scraping.\n\n` +
      `*-animeimg Naruto* — search every configured image site\n` +
      `*-animeimg unsplash Naruto* — Unsplash\n` +
      `*-animeimg pexels Naruto* — Pexels\n` +
      `*-animeimg pixabay Naruto* — Pixabay\n` +
      `*-animeimg zerochan Naruto* — Zerochan\n` +
      `*-animeimg safebooru Naruto* — Safebooru safe-mode\n` +
      `*-animeimg danbooru Naruto* — Danbooru\n` +
      `*-animeimg animepictures Naruto* — Anime-Pictures\n` +
      `*-animeimg eshuushuu Naruto* — e-shuushuu\n` +
      `*-animeimg wallhaven Naruto* — Wallhaven\n` +
      `*-animeimg alphacoders Naruto* — Alpha Coders / Wallpaper Abyss\n\n` +
      `Direct shortcuts:\n` +
      `*-unsplashimg Naruto*\n*-pexelsimg Naruto*\n*-pixabayimg Naruto*\n*-stockimg Naruto* — all 3 stock sites\n\n` +
      `*-animeimgurl <public URL>* — scrape images from any public page\n` +
      `*-animeimgget <session> <number>* — send one image\n` +
      `*-animeimgall <session>* — send first 10\n` +
      `*-animeimgsites* — list sources\n\n` +
      `⚠️ Public pages only. No login/private-access bypass. Respect each site's terms and image rights.`),
  },
  {
    command: 'animeimgsites', aliases: ['animeimagesites', 'animimgsites'], category: 'Anime Images',
    description: 'List all public image sources',
    handler: async (sock, message) => {
      const rows = getAllSourceIds().map(id => {
        const a = scraper.getSources().find(x => x.id === id) || browserScraper.getStockSources().find(x => x.id === id);
        return `• ${a.id} — ${a.name}`;
      }).join('\n');
      return reply(sock, message, `🖼️ *PUBLIC IMAGE SOURCES*\n\n${rows}\n\nNo official site APIs are required by this plugin.`);
    },
  },
  {
    command: 'animeimg', aliases: ['animeimage', 'animepicture', 'animimg'], category: 'Anime Images',
    description: 'Scrape public image search pages without official APIs',
    handler: async (sock, message, args) => {
      const q = args.join(' ').trim();
      if (!q) return reply(sock, message, 'Usage: -animeimg <query>\nExample: -animeimg Naruto Uzumaki');
      const first = safeSource(args[0]);
      const sourceIds = getAllSourceIds();
      const oneSource = sourceIds.find(x => safeSource(x) === first);
      const query = oneSource ? args.slice(1).join(' ').trim() : q;
      if (!query) return reply(sock, message, 'Add a search query after the source name.');
      try {
        const result = oneSource
          ? { query, results: [await runSource(oneSource, query, 8)], errors: [] }
          : await searchAll(query, 3);
        return sendResults(sock, message, result, query);
      } catch (e) {
        return reply(sock, message, `❌ Scrape failed: ${e.message}`);
      }
    },
  },
  {
    command: 'unsplashimg', aliases: ['unsplash', 'unsplashsearch'], category: 'Anime Images',
    description: 'Scrape Unsplash public search using Playwright',
    handler: async (sock, message, args) => {
      const q = args.join(' ').trim();
      if (!q) return reply(sock, message, 'Usage: -unsplashimg <query>');
      try { return sendResults(sock, message, { query: q, results: [await runSource('unsplash', q, 12)], errors: [] }, q); }
      catch (e) { return reply(sock, message, `❌ Unsplash scrape failed: ${e.message}`); }
    },
  },
  {
    command: 'pexelsimg', aliases: ['pexels', 'pexelssearch'], category: 'Anime Images',
    description: 'Scrape Pexels public search using Playwright',
    handler: async (sock, message, args) => {
      const q = args.join(' ').trim();
      if (!q) return reply(sock, message, 'Usage: -pexelsimg <query>');
      try { return sendResults(sock, message, { query: q, results: [await runSource('pexels', q, 12)], errors: [] }, q); }
      catch (e) { return reply(sock, message, `❌ Pexels scrape failed: ${e.message}`); }
    },
  },
  {
    command: 'pixabayimg', aliases: ['pixabay', 'pixabaysearch'], category: 'Anime Images',
    description: 'Scrape Pixabay public search using Playwright',
    handler: async (sock, message, args) => {
      const q = args.join(' ').trim();
      if (!q) return reply(sock, message, 'Usage: -pixabayimg <query>');
      try { return sendResults(sock, message, { query: q, results: [await runSource('pixabay', q, 12)], errors: [] }, q); }
      catch (e) { return reply(sock, message, `❌ Pixabay scrape failed: ${e.message}`); }
    },
  },
  {
    command: 'stockimg', aliases: ['stockimage', 'stockimagesearch'], category: 'Anime Images',
    description: 'Scrape Unsplash, Pexels and Pixabay without official APIs',
    handler: async (sock, message, args) => {
      const q = args.join(' ').trim();
      if (!q) return reply(sock, message, 'Usage: -stockimg <query>');
      const settled = await Promise.allSettled(['unsplash', 'pexels', 'pixabay'].map(s => runSource(s, q, 8)));
      const results = []; const errors = [];
      settled.forEach((r, i) => r.status === 'fulfilled' ? results.push(r.value) : errors.push({ source: ['unsplash', 'pexels', 'pixabay'][i], error: r.reason?.message || String(r.reason) }));
      return sendResults(sock, message, { query: q, results, errors }, q);
    },
  },
  {
    command: 'animeimgurl', aliases: ['animeimageurl', 'animimgurl', 'animepicturedl'], category: 'Anime Images',
    description: 'Scrape image URLs from a public webpage',
    handler: async (sock, message, args) => {
      const url = args[0];
      if (!url) return reply(sock, message, 'Usage: -animeimgurl <public http/https URL>');
      try {
        const r = await scraper.scrapeUrl(url, 20);
        if (!r.images.length) return reply(sock, message, `No images found on that public page.\nTitle: ${r.title || 'unknown'}`);
        const flat = r.images.map((x, i) => `${i + 1}. ${x.url}`).join('\n');
        return reply(sock, message, `🖼️ *PAGE IMAGE SCRAPE*\n\n${r.title || 'Untitled'}\n\n${flat}`);
      } catch (e) {
        return reply(sock, message, `❌ URL scrape failed: ${e.message}`);
      }
    },
  },
  {
    command: 'animeimgget', aliases: ['animeimageget', 'animimgget'], category: 'Anime Images',
    description: 'Send a selected scraped image',
    handler: async (sock, message, args) => {
      const [key, nRaw] = args; const n = Number(nRaw);
      const list = key ? getSession(key) : null;
      if (!list || !Number.isInteger(n) || n < 1 || n > list.length) return reply(sock, message, 'Usage: -animeimgget <session> <number>');
      const item = list[n - 1];
      try {
        return sendImage(sock, message, item.url, `🖼️ ${item.sourceName} • #${n}`);
      } catch (e) { return reply(sock, message, `❌ Image send failed: ${e.message}`); }
    },
  },
  {
    command: 'animeimgall', aliases: ['animeimageall', 'animimgall'], category: 'Anime Images',
    description: 'Send first 10 scraped images',
    handler: async (sock, message, args) => {
      const list = getSession(args[0]);
      if (!list) return reply(sock, message, 'Session expired or missing. Run -animeimg again.');
      let sent = 0;
      for (const item of list.slice(0, 10)) {
        try { await sendImage(sock, message, item.url, `🖼️ ${item.sourceName}`); sent++; } catch (_) {}
        await new Promise(r => setTimeout(r, 450));
      }
      return reply(sock, message, `✅ Sent ${sent} image(s).`);
    },
  },
];
