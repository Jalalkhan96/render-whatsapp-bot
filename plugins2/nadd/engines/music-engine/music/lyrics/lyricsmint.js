'use strict';
/**
 * LyricsMint adapter — Hindi/Punjabi song lyrics directory (link-only).
 * Verified 2026-10-05: the homepage search form posts to /search (JS-driven,
 * empty when fetched server-side). The live JSON endpoint used by the site's
 * own autocomplete is:
 *   GET https://lyricsmint.com/search/suggest.json?q=Q
 * Song pages carry a schema.org MusicRecording node with artist/album/cover
 * metadata (lookup uses that; lyrics body is never extracted).
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, metaContent, openGraph, jsonLdMusicNode } = require('../html');

const META = {
  id: 'lyricsmint', name: 'LyricsMint', type: 'lyrics', country: 'IN',
  languages: ['hi', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 15, needsKey: null,
  baseUrl: 'https://lyricsmint.com', enabled: true,
};

function namesOf(v) {
  return (Array.isArray(v) ? v : [v]).filter((x) => x && x.name).map((x) => cleanText(x.name)).filter(Boolean);
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  if (!query || !String(query).trim()) return { status: 'ok', results: [], note: 'empty query' };
  const url = META.baseUrl + '/search/suggest.json?q=' + encodeURIComponent(String(query).trim());
  const r = await fetchText(url, { accept: 'application/json' });
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'request timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  let data;
  try {
    data = JSON.parse(r.text);
  } catch (e) {
    return { status: 'source_changed', results: [], note: 'suggest.json no longer returns JSON' };
  }
  const songs = (data && Array.isArray(data.songs)) ? data.songs : null;
  if (!songs) return { status: 'source_changed', results: [], note: 'unexpected suggest.json shape' };
  const results = songs.slice(0, limit).map((s) => {
    const artist = cleanText(s.artist || '');
    const songUrl = absUrl(META.baseUrl, s.url || '');
    return {
      title: cleanText(s.name || ''), artist, artists: artist ? [artist] : [],
      album: s.album ? cleanText(s.album) : null, durationMs: null,
      releaseDate: null, year: null, isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [],
      url: songUrl, sourceId: s.url ? cleanText(s.url) : null, source: META.id,
      lyricsUrl: songUrl, lyricsAvailable: true, licenseStatus: 'link-only', extra: {},
    };
  });
  return { status: 'ok', results };
}

function songUrlFromInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  return META.baseUrl + '/' + s.replace(/^\/+/, '');
}

async function lookup(urlOrId, opts = {}) {
  const url = songUrlFromInput(urlOrId);
  const r = await fetchText(url);
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  const node = jsonLdMusicNode(html);
  const artists = node ? namesOf(node.byArtist) : [];
  const ogTitle = cleanText(og['og:title'] || '');
  if (!artists.length && ogTitle) {
    // "PASOORI LYRICS - Ali Sethi, Shae Gill"
    const m = /-\s*([^|]+)$/.exec(ogTitle.replace(/\s*lyrics\s*$/i, ''));
    if (m) {
      const parts = cleanText(m[1]).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
      if (parts.length) artists.push(...parts);
    }
  }
  const title = node && node.name ? cleanText(node.name)
    : cleanText(ogTitle.replace(/\s+lyrics\s*(-.*)?$/i, '').trim());
  const albums = node ? namesOf(node.inAlbum) : [];
  const desc = cleanText(og['og:description'] || metaContent(html, 'description'));
  const writers = [];
  let m = /while\s+([^.]+?)\s+has\s+written/i.exec(desc);
  if (m) writers.push(...cleanText(m[1]).split(/\s*&\s*|\s+and\s+|,\s*/i).map((s) => s.trim()).filter(Boolean));
  const producers = [];
  m = /has music by\s+([^.]+?)(?:\s+while|\.)/i.exec(desc);
  if (m) producers.push(...cleanText(m[1]).split(/\s*&\s*|\s+and\s+|,\s*/i).map((s) => s.trim()).filter(Boolean));
  const res = {
    title, artist: artists[0] || '', artists,
    album: albums[0] || null, durationMs: null,
    releaseDate: node && node.datePublished ? String(node.datePublished).slice(0, 10) : null,
    year: node && node.datePublished ? parseInt(String(node.datePublished).slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null,
    cover: (node && node.image) || og['og:image'] || null,
    label: null, writers, producers,
    url: og['og:url'] || url, sourceId: url, source: META.id,
    lyricsUrl: og['og:url'] || url, lyricsAvailable: true, licenseStatus: 'link-only',
    extra: {},
  };
  const snippet = desc.slice(0, 160);
  if (snippet) res.snippet = snippet;
  return res;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(META.baseUrl + '/search/suggest.json?q=a', { accept: 'application/json', retries: 1 });
  const latencyMs = Date.now() - started;
  if (r.ok) return { status: 'healthy', latencyMs, note: 'suggest.json reachable' };
  if (r.error === 'timeout') return { status: 'error', latencyMs, note: 'timeout' };
  return { status: 'error', latencyMs, note: 'http_' + r.status };
}

module.exports = { META, search, lookup, health };
