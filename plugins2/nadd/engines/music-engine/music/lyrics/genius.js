'use strict';
/**
 * Genius lyrics adapter.
 * Verified live 2026-10-05 from this VM (no key):
 *   - Search:  GET https://genius.com/api/search/song?q=Q  (public JSON, no auth)
 *   - Lookup:  GET https://genius.com/api/songs/{id}       (public JSON, no auth)
 * The official https://api.genius.com/search requires GENIUS_API_KEY (401 without
 * token, verified) and is used only when the key is present.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText, fetchJson } = require('../http');
const { cleanText, openGraph, decodeEntities } = require('../html');

const META = {
  id: 'genius', name: 'Genius', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 1, needsKey: null,
  baseUrl: 'https://genius.com', enabled: true,
};

const SEARCH_URL = 'https://genius.com/api/search/song?q=';
const SONG_URL = 'https://genius.com/api/songs/';
const OFFICIAL_SEARCH = 'https://api.genius.com/search?q=';

function mapHit(r) {
  if (!r || !r.url) return null;
  const idMatch = /\/songs\/(\d+)/.exec(r.api_path || '');
  const rel = r.release_date_components || {};
  const relDate = rel.year
    ? rel.year + '-' + String(rel.month || 1).padStart(2, '0') + '-' + String(rel.day || 1).padStart(2, '0')
    : null;
  return {
    title: r.title || null,
    artist: r.artist_names || null,
    artists: r.artist_names ? [r.artist_names] : [],
    album: null,
    durationMs: null,
    releaseDate: relDate,
    year: rel.year || null,
    isrc: null,
    genre: null,
    language: 'en',
    cover: r.header_image_thumbnail_url || r.song_art_image_thumbnail_url || null,
    label: null,
    writers: [],
    producers: [],
    url: r.url,
    sourceId: idMatch ? idMatch[1] : null,
    source: 'genius',
    lyricsUrl: r.url,
    lyricsAvailable: true,
    licenseStatus: 'link-only',
    extra: {
      apiPath: r.api_path || null,
      fullTitle: r.full_title || null,
      annotationCount: r.annotation_count != null ? r.annotation_count : null,
    },
  };
}

function hitsFromPublic(data) {
  const sections = (data && data.response && data.response.sections) || [];
  const out = [];
  for (const s of sections) {
    if (s.type !== 'song') continue;
    for (const h of s.hits || []) {
      const m = mapHit(h.result);
      if (m) out.push(m);
    }
  }
  return out;
}

function hitsFromOfficial(data) {
  const hits = (data && data.response && data.response.hits) || [];
  const out = [];
  for (const h of hits) {
    if (h.type && h.type !== 'song') continue;
    const m = mapHit(h.result);
    if (m) out.push(m);
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const key = process.env.GENIUS_API_KEY;
  try {
    if (key) {
      const r = await fetchJson(OFFICIAL_SEARCH + encodeURIComponent(q), {
        headers: { Authorization: 'Bearer ' + key },
        timeout: 15000,
      });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return { status: 'auth_required', results: [], note: 'GENIUS_API_KEY rejected (HTTP ' + r.status + ')' };
        return { status: 'error', results: [], note: 'official API HTTP ' + r.status };
      }
      return { status: 'ok', results: hitsFromOfficial(r.data).slice(0, limit), note: 'via official api.genius.com (keyed)' };
    }
    const r = await fetchJson(SEARCH_URL + encodeURIComponent(q), {
      headers: { Accept: 'application/json' },
      timeout: 15000,
    });
    if (!r.ok) {
      if (r.status === 403) return { status: 'blocked', results: [], note: 'genius.com blocked this request (HTTP 403)' };
      if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'genius.com request timed out' };
      return { status: 'error', results: [], note: 'genius.com HTTP ' + r.status };
    }
    return { status: 'ok', results: hitsFromPublic(r.data).slice(0, limit) };
  } catch (err) {
    return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
  }
}

function mapSongApi(s) {
  if (!s) return null;
  const rel = s.release_date_components || {};
  const relDate = rel.year
    ? rel.year + '-' + String(rel.month || 1).padStart(2, '0') + '-' + String(rel.day || 1).padStart(2, '0')
    : null;
  const names = (arr) => (arr || []).map((a) => a && a.name).filter(Boolean);
  const artists = [];
  if (s.primary_artist && s.primary_artist.name) artists.push(s.primary_artist.name);
  for (const n of names(s.featured_artists)) if (!artists.includes(n)) artists.push(n);
  return {
    title: s.title || null,
    artist: s.artist_names || artists[0] || null,
    artists,
    album: (s.album && s.album.name) || null,
    durationMs: null,
    releaseDate: relDate,
    year: rel.year || null,
    isrc: null,
    genre: null,
    language: 'en',
    cover: s.song_art_image_url || s.header_image_thumbnail_url || null,
    label: null,
    writers: names(s.writer_artists),
    producers: names(s.producer_artists),
    url: s.url || null,
    sourceId: s.id != null ? String(s.id) : null,
    source: 'genius',
    lyricsUrl: s.url || null,
    lyricsAvailable: true,
    licenseStatus: 'link-only',
    extra: {
      apiPath: s.api_path || null,
      fullTitle: s.full_title || null,
      annotationCount: s.annotation_count != null ? s.annotation_count : null,
      statsPageviews: (s.stats && s.stats.pageviews) || null,
    },
  };
}

async function lookupSongApi(id) {
  const r = await fetchJson(SONG_URL + encodeURIComponent(id), {
    headers: { Accept: 'application/json' },
    timeout: 15000,
  });
  if (!r.ok || !r.data || !r.data.response || !r.data.response.song) return null;
  return mapSongApi(r.data.response.song);
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  try {
    if (/^\d+$/.test(input)) return await lookupSongApi(input);
    // Resolve song page -> /songs/{id} -> song API
    const page = await fetchText(input, { timeout: 15000 });
    if (page.ok && page.text) {
      const m = /\/songs\/(\d{5,})/.exec(page.text);
      if (m) {
        const full = await lookupSongApi(m[1]);
        if (full) return full;
      }
      // Fallback: OpenGraph metadata only (link-only, no lyrics)
      const og = openGraph(page.text);
      if (og['og:title']) {
        const t = cleanText(og['og:title']).replace(/\s*[|\u2013-]\s*Genius Lyrics.*$/i, '').trim();
        const parts = t.split(/\s*[-\u2013\u2014]\s*/);
        const artist = parts.length > 1 ? parts[0] : null;
        const title = parts.length > 1 ? parts.slice(1).join(' - ') : t;
        return {
          title: title || null, artist, artists: artist ? [artist] : [],
          album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
          genre: null, language: 'en', cover: og['og:image'] || null, label: null,
          writers: [], producers: [],
          url: og['og:url'] || input, sourceId: null, source: 'genius',
          lyricsUrl: og['og:url'] || input, lyricsAvailable: true,
          licenseStatus: 'link-only', extra: { via: 'opengraph-fallback' },
        };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/** Optional extra: public artist page metadata (no key). */
async function artistInfo(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const slug = n.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const r = await fetchText('https://genius.com/artists/' + encodeURIComponent(slug), { timeout: 15000 });
  if (!r.ok) return null;
  const og = openGraph(r.text);
  const desc = (og['og:description'] || '').slice(0, 300);
  const title = cleanText(og['og:title'] || '').replace(/\s*[|\u2013-].*$/, '').trim();
  return { name: title || n, url: og['og:url'] || r.finalUrl, image: og['og:image'] || null, bio: desc || null, source: 'genius' };
}

async function health() {
  const started = Date.now();
  try {
    const r = await fetchJson(SEARCH_URL + 'test', { headers: { Accept: 'application/json' }, timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'public genius.com/api/search/song reachable' };
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'genius.com blocked (HTTP 403)' };
    return { status: 'error', latencyMs: ms, note: 'HTTP ' + r.status };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - started, note: String((err && err.message) || err).slice(0, 120) };
  }
}

module.exports = { META, search, lookup, health, artistInfo };
