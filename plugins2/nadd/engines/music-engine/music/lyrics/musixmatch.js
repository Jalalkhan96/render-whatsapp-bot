'use strict';
/**
 * Musixmatch lyrics adapter.
 * Verified live 2026-10-05 from this VM:
 *   - Website search https://www.musixmatch.com/search/<Q> -> HTTP 403
 *     (Cloudflare datacenter block). Without an API key this source is
 *     'blocked', never faked.
 *   - Official API https://api.musixmatch.com/ws/1.1/track.search needs
 *     MUSIXMATCH_API_KEY (not set in this environment; the keyed path follows
 *     the documented ws/1.1 schema and is parsed defensively).
 * Version tags (remix/live/acoustic/...) are reported in extra.version and
 * versions are never merged.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText, fetchJson } = require('../http');
const { cleanText, decodeEntities } = require('../html');

const META = {
  id: 'musixmatch', name: 'Musixmatch', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 2,
  needsKey: 'MUSIXMATCH_API_KEY (optional)',
  baseUrl: 'https://www.musixmatch.com', enabled: true,
};

const API_BASE = 'https://api.musixmatch.com/ws/1.1/';
const SITE_SEARCH = 'https://www.musixmatch.com/search/';

/** Extract version tags like (Remix), [Live], - Acoustic Version from a title. */
function versionTag(title) {
  const t = String(title || '');
  const m = /[\(\[]([^()\[\]]*(remix|live|acoustic|sped ?up|slowed|instrumental|demo|cover|extended|radio edit|version|unplugged|karaoke)[^()\[\]]*)[\)\]]/i.exec(t)
    || /[-–—]\s*([A-Za-z ]*(remix|live|acoustic|sped ?up|slowed|instrumental|demo|cover|extended|radio edit|version|unplugged|karaoke)[A-Za-z ]*)$/i.exec(t);
  return m ? cleanText(m[1] || m[0]) : null;
}

function mapApiTrack(tr) {
  if (!tr) return null;
  const id = tr.track_id != null ? String(tr.track_id) : (tr.commontrack_id != null ? 'c' + tr.commontrack_id : null);
  const url = tr.track_share_url || (id ? 'https://www.musixmatch.com/lyrics/' + encodeURIComponent(tr.artist_name || '') + '/' + encodeURIComponent(tr.track_name || '') : null);
  const genres = ((tr.primary_genres && tr.primary_genres.music_genre_list) || [])
    .map((g) => g && g.music_genre && g.music_genre.music_genre_name)
    .filter(Boolean);
  const firstRelease = tr.first_release_date || tr.updated_time || null;
  const year = firstRelease ? parseInt(String(firstRelease).slice(0, 4), 10) || null : null;
  return {
    title: tr.track_name || null,
    artist: tr.artist_name || null,
    artists: tr.artist_name ? [tr.artist_name] : [],
    album: tr.album_name || null,
    durationMs: null,
    releaseDate: firstRelease && /^\d{4}-\d{2}-\d{2}/.test(firstRelease) ? firstRelease.slice(0, 10) : null,
    year,
    isrc: null,
    genre: genres[0] || null,
    language: null,
    cover: tr.album_coverart_100x100 || null,
    label: null,
    writers: [],
    producers: [],
    url,
    sourceId: id,
    source: 'musixmatch',
    lyricsUrl: url,
    lyricsAvailable: tr.has_lyrics === 1 || tr.has_lyrics === true,
    licenseStatus: 'link-only',
    extra: {
      version: versionTag(tr.track_name),
      instrumental: tr.instrumental === 1 || tr.instrumental === true,
      explicit: tr.explicit === 1 || tr.explicit === true,
      trackRating: tr.track_rating != null ? tr.track_rating : null,
    },
  };
}

async function searchViaApi(q, limit, key) {
  const url = API_BASE + 'track.search?q_track=' + encodeURIComponent(q)
    + '&page_size=' + limit + '&s_track_rating=desc&f_has_lyrics=1&format=json'
    + '&apikey=' + encodeURIComponent(key);
  const r = await fetchJson(url, { timeout: 15000 });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) return { status: 'auth_required', results: [], note: 'MUSIXMATCH_API_KEY rejected (HTTP ' + r.status + ')' };
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'Musixmatch API timed out' };
    return { status: 'error', results: [], note: 'Musixmatch API HTTP ' + r.status };
  }
  const msg = r.data && r.data.message;
  const code = msg && msg.header && msg.header.status_code;
  if (code === 401 || code === 403) return { status: 'auth_required', results: [], note: 'MUSIXMATCH_API_KEY invalid (status_code ' + code + ')' };
  if (code !== 200) return { status: 'error', results: [], note: 'Musixmatch API status_code ' + code };
  const list = (msg.body && msg.body.track_list) || [];
  const results = [];
  for (const item of list) {
    const m = mapApiTrack(item && item.track);
    if (m) results.push(m);
    if (results.length >= limit) break;
  }
  return { status: 'ok', results, note: 'via official Musixmatch API (keyed)' };
}

async function searchViaSite(q) {
  // Best-effort website path; single polite attempt, no retries.
  const r = await fetchText(SITE_SEARCH + encodeURIComponent(q), { timeout: 15000, retries: 0 });
  if (!r.ok) {
    if (r.status === 403) return { status: 'blocked', results: [], note: 'musixmatch.com blocks datacenter requests (HTTP 403 Cloudflare); set MUSIXMATCH_API_KEY for the official API' };
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'musixmatch.com timed out' };
    return { status: 'blocked', results: [], note: 'musixmatch.com unreachable (HTTP ' + r.status + ')' };
  }
  // Site uses embedded JSON; extract track entries if present.
  const tracks = [];
  const re = /"track_name"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]{0,800}?"artist_name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(r.text)) && tracks.length < 20) {
    const title = decodeEntities(m[1]).replace(/\\"/g, '"');
    const artist = decodeEntities(m[2]).replace(/\\"/g, '"');
    const key = title + '|' + artist;
    if (seen.has(key)) continue;
    seen.add(key);
    const url = 'https://www.musixmatch.com/lyrics/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
    tracks.push({
      title, artist, artists: artist ? [artist] : [], album: null, durationMs: null,
      releaseDate: null, year: null, isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [], url, sourceId: null,
      source: 'musixmatch', lyricsUrl: url, lyricsAvailable: true,
      licenseStatus: 'link-only',
      extra: { version: versionTag(title), via: 'site-embedded-json' },
    });
  }
  if (!tracks.length) {
    return { status: 'source_changed', results: [], note: 'musixmatch.com search page structure changed (no tracks found); set MUSIXMATCH_API_KEY for the official API' };
  }
  return { status: 'ok', results: tracks };
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const key = process.env.MUSIXMATCH_API_KEY;
  try {
    if (key) {
      const r = await searchViaApi(q, limit, key);
      r.results = (r.results || []).slice(0, limit);
      return r;
    }
    const r = await searchViaSite(q);
    r.results = (r.results || []).slice(0, limit);
    return r;
  } catch (err) {
    return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
  }
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  try {
    const key = process.env.MUSIXMATCH_API_KEY;
    if (key && /^\d+$/.test(input)) {
      const r = await fetchJson(API_BASE + 'track.get?track_id=' + encodeURIComponent(input) + '&format=json&apikey=' + encodeURIComponent(key), { timeout: 15000 });
      const tr = r.ok && r.data && r.data.message && r.data.message.body && r.data.message.body.track;
      if (tr) return mapApiTrack(tr);
      return null;
    }
    // Without a key the site blocks datacenter IPs; still try once, return null on failure.
    const url = /^https?:\/\//i.test(input) ? input : SITE_SEARCH + encodeURIComponent(input);
    const r = await fetchText(url, { timeout: 15000, retries: 0 });
    if (!r.ok || !r.text) return null;
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text);
    const title = t ? cleanText(t[1]).replace(/\s*[|\u2013-]\s*Musixmatch.*$/i, '').trim() : '';
    if (!title) return null;
    const parts = title.split(/\s*[-\u2013\u2014]\s*lyrics/i)[0].split(/\s+by\s+/i);
    return {
      title: parts[0] || title, artist: parts[1] || null,
      artists: parts[1] ? [parts[1]] : [], album: null, durationMs: null,
      releaseDate: null, year: null, isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [],
      url: r.finalUrl || url, sourceId: null, source: 'musixmatch',
      lyricsUrl: r.finalUrl || url, lyricsAvailable: true,
      licenseStatus: 'link-only', extra: { version: versionTag(title), via: 'site-title-fallback' },
    };
  } catch (err) {
    return null;
  }
}

async function health() {
  const started = Date.now();
  try {
    if (process.env.MUSIXMATCH_API_KEY) {
      const r = await fetchJson(API_BASE + 'track.search?q_track=test&page_size=1&format=json&apikey=' + encodeURIComponent(process.env.MUSIXMATCH_API_KEY), { timeout: 10000, retries: 0 });
      const ms = Date.now() - started;
      const code = r.ok && r.data && r.data.message && r.data.message.header && r.data.message.header.status_code;
      if (r.ok && code === 200) return { status: 'healthy', latencyMs: ms, note: 'Musixmatch API reachable with key' };
      if (code === 401 || code === 403 || r.status === 401 || r.status === 403) return { status: 'auth_required', latencyMs: ms, note: 'MUSIXMATCH_API_KEY invalid' };
      return { status: 'error', latencyMs: ms, note: 'API HTTP ' + r.status };
    }
    const r = await fetchText(SITE_SEARCH + 'test', { timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'musixmatch.com reachable' };
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'musixmatch.com blocks datacenter IPs (HTTP 403); set MUSIXMATCH_API_KEY for API access' };
    return { status: 'error', latencyMs: ms, note: 'HTTP ' + r.status };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - started, note: String((err && err.message) || err).slice(0, 120) };
  }
}

module.exports = { META, search, lookup, health };
