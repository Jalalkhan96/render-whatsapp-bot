'use strict';

const axios = require('axios');

const UA = process.env.ABIX_ANIME_SCRAPER_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36';
const TIMEOUT = Number(process.env.ABIX_ANIME_SCRAPER_TIMEOUT_MS || 20000);
const MAX_HTML = Number(process.env.ABIX_ANIME_SCRAPER_MAX_HTML_BYTES || 8 * 1024 * 1024);
const TTL = Number(process.env.ABIX_ANIME_SCRAPER_CACHE_MS || 2 * 60 * 1000);

const cache = new Map();

function clean(v = '') {
  return String(v)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(base, href) {
  try { return new URL(href, base).href; } catch { return ''; }
}

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniq(items) {
  const seen = new Set();
  return items.filter(x => {
    const k = `${x.source}|${x.url}|${x.title}`;
    if (!x.url || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function sourceConfig(source) {
  const q = encodeURIComponent;
  return {
    mal: { name:'MyAnimeList', base:'https://myanimelist.net', search:`https://myanimelist.net/search/all?q=${q(source)}` },
    anilist: { name:'AniList', base:'https://anilist.co', search:`https://anilist.co/search/anime?search=${q(source)}` },
    animeplanet: { name:'Anime-Planet', base:'https://www.anime-planet.com', search:`https://www.anime-planet.com/anime/all?name=${q(source)}` },
    kitsu: { name:'Kitsu', base:'https://kitsu.io', search:`https://kitsu.io/anime?text=${q(source)}` },
    anidb: { name:'AniDB', base:'https://anidb.net', search:`https://anidb.net/anime/?adb.search=${q(source)}` },
    ann: { name:'Anime News Network', base:'https://www.animenewsnetwork.com', search:`https://www.animenewsnetwork.com/encyclopedia/search/name?q=${q(source)}` },
    mangaupdates: { name:'MangaUpdates', base:'https://www.mangaupdates.com', search:`https://www.mangaupdates.com/series.html?search=${q(source)}` },
    mangadex: { name:'MangaDex', base:'https://mangadex.org', search:`https://mangadex.org/search?title=${q(source)}` },
    jikan: { name:'Jikan/MAL public pages', base:'https://myanimelist.net', search:`https://myanimelist.net/search/all?q=${q(source)}` },
  };
}

async function getHtml(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < TTL) return cached.html;
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    responseType: 'text',
    maxContentLength: MAX_HTML,
    maxBodyLength: MAX_HTML,
    maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 400,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8',
      'Cache-Control': 'no-cache',
    },
  });
  const html = String(res.data || '');
  if (!html) throw new Error('Empty public page response.');
  cache.set(url, { ts: Date.now(), html });
  return html;
}

function parseMeta(html, base) {
  const out = {};
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const nm = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (!nm || content == null) continue;
    if (['og:title','twitter:title'].includes(nm)) out.title = clean(content);
    if (['og:description','twitter:description'].includes(nm)) out.description = clean(content);
    if (['og:image','twitter:image'].includes(nm)) out.image = absUrl(base, content);
  }
  return out;
}

function extractJsonLd(html, base) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const out = [];
  for (const block of blocks) {
    const m = block.match(/>([\s\S]*?)<\/script>/i);
    if (!m) continue;
    try {
      const data = JSON.parse(m[1].trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const x of arr) {
        if (!x || typeof x !== 'object') continue;
        out.push({
          title: clean(x.name || x.headline || ''),
          description: clean(x.description || ''),
          url: absUrl(base, x.url || x.mainEntityOfPage || ''),
          image: absUrl(base, Array.isArray(x.image) ? x.image[0] : (x.image || '')),
          type: clean(x['@type'] || ''),
        });
      }
    } catch {}
  }
  return out;
}

function genericAnchors(html, base, source, patterns) {
  const results = [];
  const anchors = html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const tag of anchors) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1] || '';
    const url = absUrl(base, href);
    if (!url || !patterns.some(re => re.test(url))) continue;
    const text = clean(tag.replace(/<[^>]+>/g, ' '));
    if (text.length < 2) continue;
    results.push({ source, title: text.slice(0, 140), url, image: '' });
  }
  return results;
}

function extractImagesNear(html, base) {
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return imgs.map(tag => {
    const src = tag.match(/(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] || '';
    return absUrl(base, src);
  }).filter(Boolean);
}

function normalize(source, items, meta, base) {
  const jsonld = extractJsonLd(meta.html || '', base);
  const firstImage = meta.image || extractImagesNear(meta.html || '', base)[0] || '';
  const out = [];
  for (const item of items) {
    const title = clean(item.title || meta.title || 'Untitled');
    if (!title || title.length < 2) continue;
    out.push({
      source,
      title,
      url: item.url || base,
      image: item.image || firstImage || jsonld.find(x => x.image)?.image || '',
      description: clean(item.description || meta.description || ''),
    });
  }
  for (const x of jsonld) {
    if (!x.url || !x.title) continue;
    out.push({
      source,
      title: x.title,
      url: x.url,
      image: x.image || firstImage,
      description: x.description || meta.description || '',
    });
  }
  return uniq(out).slice(0, 12);
}

function parseSource(source, html, cfg) {
  const meta = { ...parseMeta(html, cfg.base), html };
  let items = [];
  switch (source) {
    case 'mal':
    case 'jikan':
      items = genericAnchors(html, cfg.base, cfg.name, [/myanimelist\.net\/(anime|topanime|manga)\//i]);
      break;
    case 'anilist':
      items = genericAnchors(html, cfg.base, cfg.name, [/anilist\.co\/(anime|manga)\//i]);
      break;
    case 'animeplanet':
      items = genericAnchors(html, cfg.base, cfg.name, [/anime-planet\.com\/anime\//i]);
      break;
    case 'kitsu':
      items = genericAnchors(html, cfg.base, cfg.name, [/kitsu\.io\/anime\//i]);
      break;
    case 'anidb':
      items = genericAnchors(html, cfg.base, cfg.name, [/anidb\.net\/anime\//i]);
      break;
    case 'ann':
      items = genericAnchors(html, cfg.base, cfg.name, [/animenewsnetwork\.com\/encyclopedia\/(anime|manga)\.php\?id=/i]);
      break;
    case 'mangaupdates':
      items = genericAnchors(html, cfg.base, cfg.name, [/mangaupdates\.com\/series\.html\?id=/i]);
      break;
    case 'mangadex':
      items = genericAnchors(html, cfg.base, cfg.name, [/mangadex\.org\/title\//i]);
      break;
  }
  return normalize(cfg.name, items, meta, cfg.base);
}

async function searchSource(source, query, opts = {}) {
  const key = String(source || '').toLowerCase();
  const cfg = sourceConfig(query)[key] || (() => {
    const all = sourceConfig('');
    return all[key];
  })();
  if (!cfg) throw new Error(`Unknown anime source: ${source}`);
  const url = cfg.search.replace(/%2F/g, '%2F');
  const html = await getHtml(url);
  const items = parseSource(key, html, cfg).slice(0, Number(opts.limit || 8));
  return items.map(x => ({ ...x, query, sourceKey:key, searchUrl:url }));
}

async function searchAll(query, opts = {}) {
  const sources = ['mal','anilist','animeplanet','kitsu','anidb','ann','mangaupdates','mangadex','jikan'];
  const settled = await Promise.allSettled(sources.map(s => searchSource(s, query, opts)));
  const items = [];
  const failures = {};
  settled.forEach((r,i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else failures[sources[i]] = String(r.reason?.message || r.reason || 'failed');
  });
  return { items: uniq(items), failures };
}

async function scrapeUrl(url, sourceHint = '') {
  const u = new URL(url);
  const key = String(sourceHint || '').toLowerCase() ||
    (u.hostname.includes('myanimelist') ? 'mal' :
     u.hostname.includes('anilist') ? 'anilist' :
     u.hostname.includes('anime-planet') ? 'animeplanet' :
     u.hostname.includes('kitsu') ? 'kitsu' :
     u.hostname.includes('anidb') ? 'anidb' :
     u.hostname.includes('animenewsnetwork') ? 'ann' :
     u.hostname.includes('mangaupdates') ? 'mangaupdates' :
     u.hostname.includes('mangadex') ? 'mangadex' :
     u.hostname.includes('jikan') ? 'jikan' : 'unknown');
  const html = await getHtml(url);
  const cfg = sourceConfig('')[key] || {name:u.hostname,base:`${u.protocol}//${u.host}`};
  const items = parseSource(key, html, cfg);
  const meta = parseMeta(html, cfg.base);
  return {
    source: cfg.name,
    sourceKey:key,
    url,
    title: meta.title || items[0]?.title || '',
    description: meta.description || items[0]?.description || '',
    image: meta.image || items[0]?.image || '',
    results: items,
  };
}

module.exports = { searchSource, searchAll, scrapeUrl, sourceConfig, clean };
