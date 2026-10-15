'use strict';
/**
 * SoundCloud metadata adapter.
 *
 * VERIFIED LIVE (2026-10-05):
 *  - Lookup (NO KEY): https://soundcloud.com/oembed?url=<track-url>&format=json
 *    returns HTTP 200 with title ("Blinding Lights by The Weeknd"),
 *    author_name ("The Weeknd"), author_url, thumbnail_url. Verified on a
 *    real track URL. No audio is downloaded.
 *  - Search needs a client_id: https://api-v2.soundcloud.com/search?q=...
 *    without one answers HTTP 401 (host + path verified live). Without
 *    SOUNDCLOUD_CLIENT_ID, search() returns auth_required.
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'soundcloud', name: 'SoundCloud', type: 'metadata', country: 'DE',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: false, priority: 12,
  needsKey: 'SOUNDCLOUD_CLIENT_ID (for search)',
  baseUrl: 'https://soundcloud.com', enabled: true,
};

const PROBE_TRACK_URL = 'https://soundcloud.com/theweeknd/blinding-lights';

function clientId() { return process.env.SOUNDCLOUD_CLIENT_ID || null; }

function isSoundCloudUrl(s) {
  return /^(https?:\/\/)?(www\.)?soundcloud\.com\//i.test(String(s || '').trim());
}

function splitTitleAuthor(oembedTitle, authorName) {
  // oEmbed title looks like "Blinding Lights by The Weeknd".
  const t = String(oembedTitle || '');
  const m = /^(.*)\s+by\s+(.+)$/i.exec(t);
  if (m) return { title: cleanText(m[1]), artist: cleanText(m[2]) };
  return { title: cleanText(t), artist: cleanText(authorName || '') };
}

function mapApiTrack(t) {
  if (!t) return null;
  const user = t.user || {};
  return {
    title: cleanText(t.title || ''), artist: cleanText(user.username || ''),
    artists: user.username ? [cleanText(user.username)] : [],
    album: null,
    durationMs: typeof t.duration === 'number' ? Math.round(t.duration) : null,
    releaseDate: t.release_date || t.created_at || null,
    year: t.release_date ? parseInt(String(t.release_date).slice(0, 4), 10) || null : null,
    isrc: null, genre: t.genre ? cleanText(t.genre) : null, language: null,
    cover: t.artwork_url ? String(t.artwork_url).replace('-large.', '-t500x500.') : null,
    label: t.label_name ? cleanText(t.label_name) : null,
    writers: [], producers: [],
    url: t.permalink_url || null, sourceId: t.permalink_url || String(t.id || ''),
    source: 'soundcloud',
    extra: {
      playbackCount: typeof t.playback_count === 'number' ? t.playback_count : null,
      likesCount: typeof t.likes_count === 'number' ? t.likes_count : null,
      repostsCount: typeof t.reposts_count === 'number' ? t.reposts_count : null,
      commentCount: typeof t.comment_count === 'number' ? t.comment_count : null,
      waveformUrl: t.waveform_url || null,
    },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 8, 1), 25);
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  const cid = clientId();
  if (!cid) {
    return { status: 'auth_required', results: [], note: 'Set SOUNDCLOUD_CLIENT_ID for search' };
  }
  const qs = new URLSearchParams({ q: String(query).trim(), limit: String(limit), client_id: cid });
  const r = await fetchJson('https://api-v2.soundcloud.com/search?' + qs.toString());
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) return { status: 'auth_required', results: [], note: 'SoundCloud rejected the client_id' };
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'SoundCloud API timed out' };
    return { status: 'error', results: [], note: 'SoundCloud API ' + (r.error || r.status) };
  }
  const items = Array.isArray(r.data.collection) ? r.data.collection : [];
  const results = items.map(mapApiTrack).filter((t) => t && t.title);
  return { status: 'ok', results, note: 'via SoundCloud api-v2' };
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input || !isSoundCloudUrl(input)) return null;
  const clean = input.split('?')[0].replace(/\/$/, '');
  const r = await fetchJson('https://soundcloud.com/oembed?url=' + encodeURIComponent(clean) + '&format=json');
  if (!r.ok || !r.data) return null;
  const d = r.data;
  const { title, artist } = splitTitleAuthor(d.title, d.author_name);
  if (!title) return null;
  return {
    title, artist, artists: artist ? [artist] : [],
    album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
    genre: null, language: null, cover: d.thumbnail_url || null, label: null,
    writers: [], producers: [],
    url: clean, sourceId: clean, source: 'soundcloud',
    extra: {
      authorName: cleanText(d.author_name || ''),
      authorUrl: d.author_url || null,
      description: cleanText(d.description || '').slice(0, 300) || null,
    },
  };
}

async function health() {
  const started = Date.now();
  const r = await fetchJson('https://soundcloud.com/oembed?url=' + encodeURIComponent(PROBE_TRACK_URL) + '&format=json');
  const ms = Date.now() - started;
  if (r.ok && r.data && r.data.title) return { status: 'healthy', latencyMs: ms, note: 'oEmbed endpoint reachable' };
  if (r.status === 401 || r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'SoundCloud oEmbed HTTP ' + r.status };
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', latencyMs: ms, note: 'SoundCloud unreachable' };
  return { status: 'error', latencyMs: ms, note: 'SoundCloud oEmbed ' + (r.error || r.status) };
}

module.exports = { META, search, lookup, health };
