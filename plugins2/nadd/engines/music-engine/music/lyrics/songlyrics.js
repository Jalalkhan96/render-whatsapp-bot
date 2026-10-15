'use strict';
/**
 * songlyrics adapter — SongLyrics (https://www.songlyrics.com)
 *
 * Verified live (2026-10-05):
 * - Search:  GET https://www.songlyrics.com/search?q=<query>  (HTTP 200)
 *            (homepage form: method=get action=/search, field q)
 * - Results: <a href="/<artist>/<song>-lyrics/" class="serp-compact-song">Title</a>
 *            <span class="serp-compact-artist"><a ...>Artist</a></span>
 *            cover: <img src="/album_covers/..._thumb.jpg"> in the row
 * - Song page: JSON-LD schema.org MusicRecording (name, byArtist.name,
 *            inAlbum[].name, duration "PT3M20S", isrcCode, genre, inLanguage,
 *            datePublished, image)
 * Note: the site runs Cloudflare and intermittently challenges some clients;
 * node fetch with a browser UA was served normally during verification.
 * Lyrics are link-only (licenseStatus 'link-only'); no lyric text is returned.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, jsonLdMusicNode, durationToMs } = require('../html');

const META = {
  id: 'songlyrics',
  name: 'SongLyrics',
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 9,
  needsKey: null,
  baseUrl: 'https://www.songlyrics.com',
  enabled: true,
};

const SEARCH_URL = META.baseUrl + '/search?q=';
// <a href="/the-weeknd/blinding-lights-lyrics/" class="serp-compact-song">Blinding Lights</a>
// <span class="serp-compact-artist"><a href="/the-weeknd-lyrics/">The Weeknd</a></span>
const RESULT_RE = /<a href="(\/[^"]+?-lyrics\/)" class="serp-compact-song">([^<]+)<\/a>\s*<span class="serp-compact-artist"><a href="[^"]+">([^<]+)<\/a><\/span>/gi;
const COVER_RE = /<img[^>]*?src="(\/album_covers\/[^"]+?)"[^>]*?>/gi;

function norm(o) {
  const artist = o.artist || '';
  const artists = Array.isArray(o.artists) && o.artists.length ? o.artists : (artist ? [artist] : []);
  const out = {
    title: o.title || '',
    artist,
    artists,
    album: o.album || '',
    durationMs: o.durationMs != null ? o.durationMs : null,
    releaseDate: o.releaseDate || '',
    year: o.year || '',
    isrc: o.isrc || '',
    genre: o.genre || '',
    language: o.language || 'en',
    cover: o.cover || '',
    label: '',
    writers: [],
    producers: [],
    url: o.url || '',
    sourceId: o.sourceId || '',
    source: META.id,
    lyricsUrl: o.url || '',
    lyricsAvailable: true,
    licenseStatus: 'link-only',
    extra: o.extra || {},
  };
  if (o.snippet) out.snippet = o.snippet.slice(0, 160);
  return out;
}

function mapError(r) {
  if (!r || r.status === 0) {
    const e = (r && r.error) || 'unknown';
    return { status: e === 'timeout' ? 'timeout' : 'error', note: 'network error: ' + e };
  }
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    return { status: 'blocked', note: 'HTTP ' + r.status + ' from ' + META.baseUrl + ' (bot filtering)' };
  }
  return { status: 'error', note: 'HTTP ' + r.status + ' from ' + META.baseUrl };
}

function songIdFromHref(href) {
  const m = /^\/([^\/]+)\/([^\/]+)-lyrics\/$/i.exec(href || '');
  return m ? m[1] + '/' + m[2] : '';
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(50, opts.limit || 8));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const started = Date.now();
  let r;
  try {
    r = await fetchText(SEARCH_URL + encodeURIComponent(q));
  } catch (e) {
    return Object.assign({ results: [] }, mapError({ status: 0, error: String(e && e.message) }));
  }
  if (!r.ok) return Object.assign({ results: [] }, mapError(r));
  if (/Just a moment/i.test(r.text)) {
    return { status: 'blocked', results: [], note: 'Cloudflare challenge on search page' };
  }
  if (!/serp-compact-song/.test(r.text)) {
    return { status: 'source_changed', results: [], note: 'search result markup not found (ms ' + (Date.now() - started) + ')' };
  }
  const html = r.text;
  const results = [];
  RESULT_RE.lastIndex = 0;
  let m;
  while ((m = RESULT_RE.exec(html)) && results.length < limit) {
    const href = m[1];
    const title = cleanText(m[2]);
    const artist = cleanText(m[3]);
    if (!title) continue;
    // Cover: nearest album_covers img before this result's anchor.
    let cover = '';
    COVER_RE.lastIndex = 0;
    let cm, last = null;
    while ((cm = COVER_RE.exec(html)) && cm.index < m.index) last = cm;
    if (last) cover = absUrl(META.baseUrl, last[1]);
    results.push(norm({
      title,
      artist,
      url: absUrl(META.baseUrl, href),
      sourceId: songIdFromHref(href),
      cover,
      extra: { searchMs: Date.now() - started },
    }));
  }
  return { status: 'ok', results };
}

function str(v) { return v == null ? '' : cleanText(String(v)); }

function metaFromJsonLd(node) {
  const out = {};
  if (!node || typeof node !== 'object') return out;
  out.title = str(node.name);
  const by = node.byArtist;
  if (by) {
    out.artist = str(typeof by === 'string' ? by : by.name);
    if (by && typeof by === 'object' && by.alternateName) out.artists = [out.artist, str(by.alternateName)];
  }
  const alb = Array.isArray(node.inAlbum) ? node.inAlbum[0] : node.inAlbum;
  if (alb && typeof alb === 'object') {
    out.album = str(alb.name);
    const ym = /(\d{4})/.exec(String(alb.datePublished || ''));
    if (ym) out.year = ym[1];
  }
  const dp = str(node.datePublished);
  const ym = /(\d{4})/.exec(dp);
  if (ym) { out.year = ym[1]; out.releaseDate = dp.slice(0, 10); }
  if (node.duration) out.durationMs = durationToMs(str(node.duration));
  if (node.isrcCode) out.isrc = str(node.isrcCode);
  if (node.genre) out.genre = str(Array.isArray(node.genre) ? node.genre[0] : node.genre);
  if (node.inLanguage) out.language = str(node.inLanguage);
  const img = node.image;
  if (img) out.cover = absUrl(META.baseUrl, typeof img === 'string' ? img : (img.contentUrl || img.url || ''));
  return out;
}

async function lookup(urlOrId, opts = {}) {
  const id = String(urlOrId || '').trim();
  if (!id) return null;
  const url = /^https?:\/\//i.test(id) ? id : absUrl(META.baseUrl, id.startsWith('/') ? id : '/' + id);
  let r;
  try {
    r = await fetchText(url);
  } catch (e) {
    return null;
  }
  if (!r.ok || /Just a moment/i.test(r.text)) return null;
  const meta = metaFromJsonLd(jsonLdMusicNode(r.text));
  if (!meta.title) {
    // Fallback: "<title>The Weeknd - Blinding Lights Lyrics & Meaning</title>"
    const t = pageTitle(r.text);
    const m = /^(.+?)\s*-\s*(.+?)\s+lyrics/i.exec(t);
    if (m) { meta.artist = cleanText(m[1]); meta.title = cleanText(m[2]); }
  }
  if (!meta.title) return null;
  const finalUrl = r.finalUrl || url;
  return norm({
    title: meta.title,
    artist: meta.artist || '',
    artists: meta.artists,
    album: meta.album || '',
    durationMs: meta.durationMs,
    releaseDate: meta.releaseDate || '',
    year: meta.year || '',
    isrc: meta.isrc || '',
    genre: meta.genre || '',
    language: meta.language || 'en',
    cover: meta.cover || '',
    url: finalUrl,
    sourceId: songIdFromHref(new URL(finalUrl).pathname) || songIdFromHref(new URL(url).pathname),
  });
}

async function health() {
  const started = Date.now();
  let r;
  try {
    r = await fetchText(META.baseUrl + '/', { retries: 0 });
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - started, note: 'network error: ' + String((e && e.message) || e) };
  }
  const latencyMs = Date.now() - started;
  if (r.ok && !/Just a moment/i.test(r.text)) {
    return { status: 'healthy', latencyMs, note: 'homepage reachable (HTTP 200)' };
  }
  if (r.status === 401 || r.status === 403 || /Just a moment/i.test(r.text)) {
    return { status: 'blocked', latencyMs, note: 'HTTP ' + r.status + ' / Cloudflare challenge (bot filtering)' };
  }
  return { status: 'error', latencyMs, note: 'HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
