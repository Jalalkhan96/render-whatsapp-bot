'use strict';
/**
 * Deezer metadata adapter (keyless public API).
 *
 * Endpoints VERIFIED live from this VM (2026-10-05):
 *   GET https://api.deezer.com/search?q=...&limit=N   -> 200 JSON { data: [ {id,title,title_short,title_version,isrc,link,duration,rank,explicit_lyrics,artist{name,id,link},album{id,title,cover,cover_big,cover_xl}} ] }
 *   GET https://api.deezer.com/track/<id>             -> 200 JSON (adds release_date, bpm, contributors[], album.title/cover_xl)
 *   GET https://api.deezer.com/artist/<id>            -> 200 JSON
 *   GET https://api.deezer.com/album/<id>             -> 200 JSON
 *
 * Note: api.deezer.com's edge (Akamai) refused a bare curl UA during verification;
 * this adapter always sends a browser-like UA (the shared http helper default),
 * which succeeded. No media downloads (preview URLs are never fetched).
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'deezer', name: 'Deezer', type: 'metadata', country: 'FR',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: false, priority: 7, needsKey: null,
  baseUrl: 'https://api.deezer.com', enabled: true,
};

const API = 'https://api.deezer.com';

function statusOf(r) {
  if (!r) return 'error';
  if (r.status === 429 || r.status === 403) return 'blocked';
  if (r.error === 'timeout') return 'timeout';
  return 'error';
}

function coverOf(album) {
  if (!album) return null;
  return album.cover_xl || album.cover_big || album.cover_medium || album.cover || null;
}

function normalizeTrack(t) {
  if (!t || t.id == null) return null;
  const artist = t.artist || {};
  const album = t.album || {};
  const contributors = (t.contributors && t.contributors.length ? t.contributors : (artist.name ? [artist] : []))
    .map((c) => cleanText(c.name || '')).filter(Boolean);
  const date = t.release_date || null;
  return {
    title: cleanText(t.title_short || t.title || ''),
    artist: cleanText(artist.name || '') || contributors[0] || null,
    artists: contributors,
    album: cleanText(album.title || '') || null,
    durationMs: t.duration != null ? Number(t.duration) * 1000 : null,
    releaseDate: date || null,
    year: date ? Number(String(date).slice(0, 4)) || null : null,
    isrc: t.isrc || null,
    genre: null,
    language: null,
    cover: coverOf(album),
    label: null,
    writers: [],
    producers: [],
    url: t.link || `https://www.deezer.com/track/${t.id}`,
    sourceId: String(t.id),
    source: 'deezer',
    extra: {
      rank: t.rank != null ? t.rank : null,
      explicitLyrics: Boolean(t.explicit_lyrics),
      bpm: t.bpm != null ? t.bpm : null,
      titleVersion: t.title_version || null,
    },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 25);
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchJson(`${API}/search?q=${encodeURIComponent(q)}&limit=${limit}`, { retries: 1 });
  if (!r.ok) return { status: statusOf(r), results: [], note: `deezer search: http_${r.status}` };
  const data = (r.data && r.data.data) || [];
  return { status: 'ok', results: data.map(normalizeTrack).filter(Boolean) };
}

function parseDeezerInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  const m = s.match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/) || (/^\d+$/.test(s) ? [null, s] : null);
  return m ? m[1] : null;
}

async function lookup(urlOrId, opts = {}) {
  const id = parseDeezerInput(urlOrId);
  if (!id) return null;
  const r = await fetchJson(`${API}/track/${id}`, { retries: 1 });
  if (!r.ok || !r.data || r.data.error) return null;
  return normalizeTrack(r.data);
}

async function health() {
  const t0 = Date.now();
  const r = await fetchJson(`${API}/track/3135556`, { retries: 0 });
  if (r.ok) return { status: 'healthy', latencyMs: Date.now() - t0, note: 'deezer api reachable' };
  return { status: statusOf(r), latencyMs: Date.now() - t0, note: `http_${r.status}` };
}

/** Extra: artist metadata by name. */
async function artistInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const s = await fetchJson(`${API}/search/artist?q=${encodeURIComponent(q)}&limit=1`, { retries: 1 });
  if (!s.ok || !(s.data && s.data.data && s.data.data.length)) return null;
  const id = s.data.data[0].id;
  const r = await fetchJson(`${API}/artist/${id}`, { retries: 1 });
  if (!r.ok || !r.data) return null;
  const a = r.data;
  return {
    name: cleanText(a.name || ''), id: String(a.id), url: a.link || `https://www.deezer.com/artist/${a.id}`,
    albums: a.nb_album != null ? a.nb_album : null, fans: a.nb_fan != null ? a.nb_fan : null,
    picture: a.picture_xl || a.picture_big || a.picture || null,
    source: 'deezer',
  };
}

/** Extra: album metadata by name. */
async function albumInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const s = await fetchJson(`${API}/search/album?q=${encodeURIComponent(q)}&limit=1`, { retries: 1 });
  if (!s.ok || !(s.data && s.data.data && s.data.data.length)) return null;
  const id = s.data.data[0].id;
  const r = await fetchJson(`${API}/album/${id}`, { retries: 1 });
  if (!r.ok || !r.data) return null;
  const a = r.data;
  const date = a.release_date || null;
  return {
    title: cleanText(a.title || ''), id: String(a.id), url: a.link || `https://www.deezer.com/album/${a.id}`,
    artist: cleanText((a.artist && a.artist.name) || '') || null,
    date, year: date ? Number(String(date).slice(0, 4)) || null : null,
    genres: ((a.genres && a.genres.data) || []).map((g) => cleanText(g.name || '')).filter(Boolean),
    trackCount: a.nb_tracks != null ? a.nb_tracks : null,
    label: cleanText(a.label || '') || null,
    cover: coverOf(a),
    source: 'deezer',
  };
}

module.exports = { META, search, lookup, health, artistInfo, albumInfo };
