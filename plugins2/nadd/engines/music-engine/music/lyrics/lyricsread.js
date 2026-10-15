'use strict';
/**
 * LyricsRead adapter — Urdu/Punjabi/English song lyrics directory (link-only).
 * Verified 2026-10-05: Next.js app (www.lyricsread.com). The header search is
 * client-side; the site's own JSON search API is:
 *   GET https://www.lyricsread.com/api/search?keyword=Q
 * (params "q"/"query" return 400 "Keyword is required").
 * Returns { nodes:[{ date, slug, title, featuredImage, lyrics:{ songName, songVideo } }] }.
 * Title format: "Pasoorian Song Lyrics – Diljit Dosanjh | from Sardaar Ji 3".
 * Lookup reads the song page's OpenGraph metadata only (never the lyrics body).
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, metaContent, openGraph } = require('../html');

const META = {
  id: 'lyricsread', name: 'LyricsRead', type: 'lyrics', country: 'PK',
  languages: ['ur', 'pa', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 19, needsKey: null,
  baseUrl: 'https://lyricsread.com', enabled: true,
};

const WWW = 'https://www.lyricsread.com';

/** Parse "Pasoorian Song Lyrics – Diljit Dosanjh | from Sardaar Ji 3". */
function parseTitle(title) {
  const t = cleanText(title).replace(/\s*\|\s*LyricsREAD\s*$/i, '');
  const film = /\|\s*from\s+([^|]+)$/i.exec(t);
  const album = film ? cleanText(film[1]) : null;
  const core = cleanText(t.split('|')[0]);
  const parts = core.split(/\s+[–-]\s+/);
  const song = cleanText((parts[0] || '').replace(/\s+song\s+lyrics\s*$/i, ''));
  const artist = parts.length > 1 ? cleanText(parts.slice(1).join(' - ')) : '';
  return { song: song || cleanText(core), artist, album };
}

/** Song descriptions mention the language, e.g. "is a lively Punjabi song". */
function detectLanguage(text) {
  const m = /is a[n]?\s+(?:lively\s+|beautiful\s+)?([A-Za-z]+)\s+song/i.exec(cleanText(text));
  return m ? m[1].toLowerCase() : null;
}

function nodeToResult(n) {
  const p = parseTitle(n.title || '');
  const title = (n.lyrics && n.lyrics.songName ? cleanText(n.lyrics.songName) : p.song);
  const url = WWW + '/' + String(n.slug || '').replace(/^\/+/, '');
  const artist = p.artist;
  return {
    title, artist, artists: artist ? artist.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [],
    album: p.album, durationMs: null,
    releaseDate: n.date ? String(n.date).slice(0, 10) : null,
    year: n.date ? parseInt(String(n.date).slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null,
    cover: (n.featuredImage && n.featuredImage.url) || null,
    label: null, writers: [], producers: [],
    url, sourceId: n.slug || null, source: META.id,
    lyricsUrl: url, lyricsAvailable: true, licenseStatus: 'link-only', extra: {},
  };
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  if (!query || !String(query).trim()) return { status: 'ok', results: [], note: 'empty query' };
  const url = WWW + '/api/search?keyword=' + encodeURIComponent(String(query).trim());
  const r = await fetchText(url, { accept: 'application/json' });
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'request timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  let data;
  try {
    data = JSON.parse(r.text);
  } catch (e) {
    return { status: 'source_changed', results: [], note: '/api/search no longer returns JSON' };
  }
  const nodes = data && Array.isArray(data.nodes) ? data.nodes : null;
  if (!nodes) return { status: 'source_changed', results: [], note: 'unexpected /api/search shape' };
  return { status: 'ok', results: nodes.slice(0, limit).map(nodeToResult) };
}

function songUrlFromInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  return WWW + '/' + s.replace(/^\/+/, '');
}

async function lookup(urlOrId, opts = {}) {
  const url = songUrlFromInput(urlOrId);
  const r = await fetchText(url);
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  const ogTitle = cleanText(og['og:title'] || '');
  if (!ogTitle) return null;
  const p = parseTitle(ogTitle);
  const artists = p.artist ? p.artist.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [];
  const desc = cleanText(og['og:description'] || metaContent(html, 'description'));
  const lang = detectLanguage(desc);
  const res = {
    title: p.song, artist: artists[0] || '', artists,
    album: p.album, durationMs: null, releaseDate: null, year: null,
    isrc: null, genre: null, language: null,
    cover: og['og:image'] || null, label: null, writers: [], producers: [],
    url: og['og:url'] || url, sourceId: url, source: META.id,
    lyricsUrl: og['og:url'] || url, lyricsAvailable: true, licenseStatus: 'link-only',
    extra: lang ? { language: lang } : {},
  };
  const snippet = desc.slice(0, 160);
  if (snippet) res.snippet = snippet;
  return res;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(WWW + '/api/search?keyword=a', { accept: 'application/json', retries: 1 });
  const latencyMs = Date.now() - started;
  if (r.ok) return { status: 'healthy', latencyMs, note: '/api/search reachable' };
  if (r.error === 'timeout') return { status: 'error', latencyMs, note: 'timeout' };
  return { status: 'error', latencyMs, note: 'http_' + r.status };
}

module.exports = { META, search, lookup, health };
