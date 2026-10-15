'use strict';
/**
 * lyricsfreak adapter — LyricsFreak (https://www.lyricsfreak.com)
 *
 * Verified live (2026-10-05):
 * - Search:  GET https://www.lyricsfreak.com/search.php?q=<query>  (HTTP 200)
 * - Results: <div class="lf-list__row" data-sorting-artist=".." data-sorting-song="..">
 *            with <a href="/<letter>/<artist>/<song>_<id>.html" class="song">
 * - Song page: JSON-LD schema.org MusicRecording (name, byArtist.name,
 *            inAlbum[].name/albumRelease/image, datePublished)
 * Lyrics are link-only (licenseStatus 'link-only'); no lyric text is returned.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, jsonLdMusicNode } = require('../html');

const META = {
  id: 'lyricsfreak',
  name: 'LyricsFreak',
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 10,
  needsKey: null,
  baseUrl: 'https://www.lyricsfreak.com',
  enabled: true,
};

const SEARCH_URL = META.baseUrl + '/search.php?q=';
// <div class="lf-list__row ..." data-sorting-artist="U2" data-sorting-song="City Of Blinding Lights">
//   ... <a href="/u/u2/city+of+blinding+lights_10160905.html" class="song" ...>
// (anchor attributes may be split across lines, so the row and the anchor
// are matched in two steps)
const ROW_RE = /<div class="lf-list__row[^>]*?data-sorting-artist="([^"]*)"[^>]*?data-sorting-song="([^"]*)"[^>]*?>/gi;
const SONG_ANCHOR_RE = /<a\b[^>]*?class="song"[^>]*?>/i;

function songHrefFromAnchor(tag) {
  const m = /href="([^"]+)"/i.exec(tag || '');
  return m ? m[1] : '';
}

function norm(o) {
  const artist = o.artist || '';
  return {
    title: o.title || '',
    artist,
    artists: artist ? [artist] : [],
    album: o.album || '',
    durationMs: null,
    releaseDate: o.releaseDate || '',
    year: o.year || '',
    isrc: '',
    genre: '',
    language: 'en',
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
    snippet: '',
    extra: o.extra || {},
  };
}

function mapError(r) {
  if (!r || r.status === 0) {
    const e = (r && r.error) || 'unknown';
    return { status: e === 'timeout' ? 'timeout' : 'error', note: 'network error: ' + e };
  }
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    return { status: 'blocked', note: 'HTTP ' + r.status + ' from ' + META.baseUrl };
  }
  return { status: 'error', note: 'HTTP ' + r.status + ' from ' + META.baseUrl };
}

function songIdFromHref(href) {
  const m = /_(\d+)\.html$/i.exec(href || '');
  return m ? m[1] : '';
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
  if (!/lf-list/.test(r.text)) {
    return { status: 'source_changed', results: [], note: 'search result list markup not found (ms ' + (Date.now() - started) + ')' };
  }
  const results = [];
  const html = r.text;
  ROW_RE.lastIndex = 0;
  let m;
  while ((m = ROW_RE.exec(html)) && results.length < limit) {
    const artist = cleanText(m[1]);
    const title = cleanText(m[2]);
    if (!title) continue;
    // Find the song anchor after this row's opening div (before the next row).
    const nextRow = html.indexOf('lf-list__row', m.index + m[0].length);
    const windowEnd = nextRow > 0 ? nextRow : m.index + 4000;
    const anchor = SONG_ANCHOR_RE.exec(html.slice(m.index, windowEnd));
    const href = songHrefFromAnchor(anchor && anchor[0]);
    if (!href || !/\.html$/i.test(href)) continue;
    const url = absUrl(META.baseUrl, href);
    results.push(norm({
      title,
      artist,
      url,
      sourceId: songIdFromHref(href),
      extra: { searchMs: Date.now() - started },
    }));
  }
  return { status: 'ok', results };
}

function metaFromJsonLd(node) {
  const out = {};
  if (!node || typeof node !== 'object') return out;
  if (node.name) out.title = cleanText(node.name);
  const by = node.byArtist;
  if (by) out.artist = cleanText(typeof by === 'string' ? by : (by.name || ''));
  const alb = Array.isArray(node.inAlbum) ? node.inAlbum[0] : node.inAlbum;
  if (alb && typeof alb === 'object') {
    if (alb.name) out.album = cleanText(alb.name);
    if (alb.image) out.cover = absUrl(META.baseUrl, alb.image);
    const yr = alb.albumRelease || alb.datePublished || '';
    const ym = /(\d{4})/.exec(String(yr));
    if (ym) out.year = ym[1];
  }
  if (node.datePublished && !out.year) {
    const ym = /(\d{4})/.exec(String(node.datePublished));
    if (ym) { out.year = ym[1]; out.releaseDate = String(node.datePublished).slice(0, 10); }
  }
  if (node.image && !out.cover) out.cover = absUrl(META.baseUrl, node.image);
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
  if (!r.ok) return null;
  const html = r.text;
  const node = jsonLdMusicNode(html);
  const meta = metaFromJsonLd(node);
  if (!meta.title) {
    // Fallback: "<title>U2 - City Of Blinding Lights lyrics | LyricsFreak</title>"
    const t = pageTitle(html);
    const m = /^(.+?)\s*-\s*(.+?)\s+lyrics(?:\s*\||$)/i.exec(t);
    if (m) { meta.artist = cleanText(m[1]); meta.title = cleanText(m[2]); }
  }
  if (!meta.title) return null; // unrecognised song page
  const finalUrl = r.finalUrl || url;
  return norm({
    title: meta.title,
    artist: meta.artist || '',
    album: meta.album || '',
    year: meta.year || '',
    releaseDate: meta.releaseDate || '',
    cover: meta.cover || '',
    url: finalUrl,
    sourceId: songIdFromHref(finalUrl) || songIdFromHref(url),
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
  if (r.ok) return { status: 'healthy', latencyMs, note: 'homepage reachable (HTTP 200)' };
  if (r.status === 401 || r.status === 403) {
    return { status: 'blocked', latencyMs, note: 'HTTP ' + r.status + ' (bot filtering)' };
  }
  return { status: 'error', latencyMs, note: 'HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
