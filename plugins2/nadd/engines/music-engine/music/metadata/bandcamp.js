'use strict';
/**
 * Bandcamp metadata adapter.
 *
 * VERIFIED LIVE (2026-10-05):
 *  - Search: https://bandcamp.com/search?q=Q answers HTTP 200 but the body
 *    is a "Client Challenge" bot check (no results, no markup). Bot
 *    challenges are not solved, so search() honestly reports {status:'blocked'}.
 *  - Lookup: artist track/album pages are reachable and embed a
 *    data-tralbum="..." JSON blob (verified on a real album page) with
 *    trackinfo[] (title, duration in seconds, track_num, title_link),
 *    album_release_date, and artist. Page OG metadata supplies title
 *    ("<release>, by <artist>") and cover image.
 */
const { fetchText } = require('../http');
const { cleanText, decodeEntities, metaContent } = require('../html');

const META = {
  id: 'bandcamp', name: 'Bandcamp', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 13,
  needsKey: null,
  baseUrl: 'https://bandcamp.com', enabled: true,
};

const PROBE_ALBUM_URL = 'https://dsci4.bandcamp.com/album/fragments-ep';

function isBandcampUrl(s) {
  return /^(https?:\/\/)?[a-z0-9-]+\.bandcamp\.com\//i.test(String(s || '').trim());
}

function parseTralbum(html) {
  const m = /data-tralbum="([^"]*)"/i.exec(html || '');
  if (!m) return null;
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch (e) {
    return null;
  }
}

function parseReleaseDate(s) {
  if (!s) return null;
  const d = new Date(String(s));
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function artistFromOgTitle(ogTitle) {
  const m = /^(.*),\s+by\s+(.+)$/i.exec(String(ogTitle || ''));
  if (m) return { release: cleanText(m[1]), artist: cleanText(m[2]) };
  return { release: cleanText(ogTitle || ''), artist: '' };
}

function baseTrack(info, url, ogImage, artist, albumTitle, releaseDate, trackNum) {
  const durSec = info && typeof info.duration === 'number' ? info.duration : null;
  return {
    title: cleanText((info && info.title) || ''), artist: cleanText(artist || ''),
    artists: artist ? [cleanText(artist)] : [],
    album: albumTitle ? cleanText(albumTitle) : null,
    durationMs: durSec != null ? Math.round(durSec * 1000) : null,
    releaseDate: releaseDate || null,
    year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null, cover: ogImage || null,
    label: null, writers: [], producers: [],
    url: url || null, sourceId: url || null, source: 'bandcamp',
    extra: trackNum != null ? { trackNumber: trackNum } : {},
  };
}

async function search(query, opts = {}) {
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  const r = await fetchText(META.baseUrl + '/search?q=' + encodeURIComponent(String(query).trim()));
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'bandcamp.com timed out' };
  if (!r.ok) return { status: 'error', results: [], note: 'bandcamp.com search HTTP ' + r.status };
  if (/Client Challenge/i.test(r.text || '')) {
    return {
      status: 'blocked', results: [],
      note: 'Bandcamp serves a "Client Challenge" bot check to automated clients; search is unavailable (no public search API exists)',
    };
  }
  if (!/searchresult|result-info|search_result/i.test(r.text || '')) {
    return { status: 'source_changed', results: [], note: 'bandcamp.com search markup changed; parser not implemented' };
  }
  return { status: 'source_changed', results: [], note: 'bandcamp.com search markup changed; parser not implemented' };
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input || !isBandcampUrl(input)) return null;
  const clean = input.split('?')[0].replace(/\/$/, '');
  const r = await fetchText(clean);
  if (!r.ok) return null;
  if (/Client Challenge/i.test(r.text || '')) return null;
  const tralbum = parseTralbum(r.text);
  if (!tralbum) return null;
  const ogTitle = metaContent(r.text, 'og:title');
  const ogImage = metaContent(r.text, 'og:image');
  const fromOg = artistFromOgTitle(ogTitle);
  const artist = cleanText(tralbum.artist || '') || fromOg.artist;
  const releaseDate = parseReleaseDate(tralbum.album_release_date);
  const trackinfo = Array.isArray(tralbum.trackinfo) ? tralbum.trackinfo : [];
  const isTrackPage = /\/track\//i.test(clean);

  if (isTrackPage) {
    const current = tralbum.current || {};
    const info = trackinfo.find((t) => t && String(t.title_link || '') &&
      clean.endsWith(String(t.title_link))) || trackinfo[0] || {};
    const t = baseTrack(
      { title: current.title || info.title, duration: info.duration },
      clean, ogImage, artist, fromOg.release, releaseDate, info.track_num || null
    );
    if (!t.title) return null;
    t.extra.isTrackPage = true;
    return t;
  }

  // Album page: normalized album object with track list in extra.
  const tracks = trackinfo.map((t) => baseTrack(
    t, clean, ogImage, artist, fromOg.release, releaseDate, t.track_num || null
  )).filter((t) => t.title);
  return {
    title: fromOg.release || cleanText(tralbum.current && tralbum.current.title || ''),
    artist, artists: artist ? [artist] : [],
    album: fromOg.release || null,
    durationMs: tracks.reduce((a, t) => a + (t.durationMs || 0), 0) || null,
    releaseDate, year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null, cover: ogImage || null,
    label: null, writers: [], producers: [],
    url: clean, sourceId: clean, source: 'bandcamp',
    extra: {
      type: 'album', trackCount: tracks.length,
      tracks: tracks.map((t) => ({ title: t.title, durationMs: t.durationMs, trackNumber: t.extra.trackNumber })),
    },
  };
}

async function health() {
  const started = Date.now();
  const r = await fetchText(PROBE_ALBUM_URL);
  const ms = Date.now() - started;
  if (r.ok && parseTralbum(r.text)) return { status: 'healthy', latencyMs: ms, note: 'album page with data-tralbum reachable' };
  if (/Client Challenge/i.test(r.text || '')) return { status: 'blocked', latencyMs: ms, note: 'Bandcamp bot challenge on album page' };
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', latencyMs: ms, note: 'bandcamp.com unreachable' };
  return { status: 'error', latencyMs: ms, note: 'bandcamp.com HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
