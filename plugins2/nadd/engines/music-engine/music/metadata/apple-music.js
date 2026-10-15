'use strict';
/**
 * Apple Music metadata adapter via the keyless iTunes Search API.
 *
 * Endpoints VERIFIED live from this VM (2026-10-05):
 *   GET https://itunes.apple.com/search?term=...&entity=song&limit=N  -> 200 JSON (resultCount + results[])
 *   GET https://itunes.apple.com/lookup?id=<trackId>                  -> 200 JSON (single track object)
 * No API key required. lookup() accepts an Apple Music song URL
 * (music.apple.com/...?i=<id>) or a numeric iTunes track id.
 * Artwork URLs are normalized to 1000x1000 by replacing the trailing size suffix.
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'apple-music', name: 'Apple Music', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: false, priority: 6, needsKey: null,
  baseUrl: 'https://music.apple.com', enabled: true,
};

const API = 'https://itunes.apple.com';

function statusOf(r) {
  if (!r) return 'error';
  if (r.status === 429 || r.status === 403) return 'blocked';
  if (r.error === 'timeout') return 'timeout';
  return 'error';
}

function bigArtwork(url) {
  const u = String(url || '');
  if (!u) return null;
  return u.replace(/\/\d+x\d+bb\.jpg$/, '/1000x1000bb.jpg');
}

function normalizeSong(t) {
  if (!t || !t.trackId) return null;
  const date = t.releaseDate || null;
  return {
    title: cleanText(t.trackName || ''),
    artist: cleanText(t.artistName || '') || null,
    artists: t.artistName ? [cleanText(t.artistName)] : [],
    album: cleanText(t.collectionName || '') || null,
    durationMs: t.trackTimeMillis != null ? Number(t.trackTimeMillis) : null,
    releaseDate: date ? String(date).slice(0, 10) : null,
    year: date ? Number(String(date).slice(0, 4)) || null : null,
    isrc: t.isrc || null,
    genre: cleanText(t.primaryGenreName || '') || null,
    language: null,
    cover: bigArtwork(t.artworkUrl100 || t.artworkUrl60 || ''),
    label: null,
    writers: [],
    producers: [],
    url: t.trackViewUrl || `https://music.apple.com/us/album/x/${t.collectionId || ''}?i=${t.trackId}`,
    sourceId: String(t.trackId),
    source: 'apple-music',
    extra: {
      collectionId: t.collectionId != null ? String(t.collectionId) : null,
      artistId: t.artistId != null ? String(t.artistId) : null,
      trackNumber: t.trackNumber != null ? t.trackNumber : null,
      trackCount: t.trackCount != null ? t.trackCount : null,
      explicitness: t.trackExplicitness || null,
      country: t.country || null,
    },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 50);
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const url = `${API}/search?term=${encodeURIComponent(q)}&entity=song&limit=${limit}&country=US`;
  const r = await fetchJson(url, { retries: 1 });
  if (!r.ok) return { status: statusOf(r), results: [], note: `itunes search: http_${r.status}` };
  const items = (r.data && r.data.results) || [];
  return { status: 'ok', results: items.map(normalizeSong).filter(Boolean) };
}

function parseAppleInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  const m = s.match(/[?&]i=(\d+)/) || s.match(/\/id(\d+)(?:[/?]|$)/);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const id = parseAppleInput(urlOrId);
  if (!id) return null;
  const r = await fetchJson(`${API}/lookup?id=${id}`, { retries: 1 });
  if (!r.ok || !r.data || !(r.data.results || []).length) return null;
  return normalizeSong(r.data.results[0]);
}

async function health() {
  const t0 = Date.now();
  const r = await fetchJson(`${API}/search?term=hello&entity=song&limit=1`, { retries: 0 });
  if (r.ok) return { status: 'healthy', latencyMs: Date.now() - t0, note: 'itunes search api reachable' };
  return { status: statusOf(r), latencyMs: Date.now() - t0, note: `http_${r.status}` };
}

/** Extra: artist metadata by name (entity=musicArtist). */
async function artistInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const r = await fetchJson(`${API}/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=1`, { retries: 1 });
  if (!r.ok || !r.data || !(r.data.results || []).length) return null;
  const a = r.data.results[0];
  return {
    name: cleanText(a.artistName || ''), id: String(a.artistId || ''),
    url: a.artistLinkUrl || a.artistViewUrl || null,
    genre: cleanText(a.primaryGenreName || '') || null,
    source: 'apple-music',
  };
}

/** Extra: album metadata by name (entity=album). */
async function albumInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const r = await fetchJson(`${API}/search?term=${encodeURIComponent(q)}&entity=album&limit=1`, { retries: 1 });
  if (!r.ok || !r.data || !(r.data.results || []).length) return null;
  const a = r.data.results[0];
  const date = a.releaseDate || null;
  return {
    title: cleanText(a.collectionName || ''), id: String(a.collectionId || ''),
    url: a.collectionViewUrl || null, artist: cleanText(a.artistName || '') || null,
    date: date ? String(date).slice(0, 10) : null,
    year: date ? Number(String(date).slice(0, 4)) || null : null,
    genre: cleanText(a.primaryGenreName || '') || null,
    trackCount: a.trackCount != null ? a.trackCount : null,
    cover: bigArtwork(a.artworkUrl100 || ''),
    source: 'apple-music',
  };
}

module.exports = { META, search, lookup, health, artistInfo, albumInfo };
