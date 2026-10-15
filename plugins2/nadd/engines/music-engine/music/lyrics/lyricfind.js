'use strict';
/**
 * LyricFind lyrics adapter.
 * LyricFind is a licensed B2B lyrics API: there is NO public website search
 * and NO keyless access. Per the engine spec this adapter returns
 * 'auth_required' (naming LYRICFIND_API_KEY) when the key is absent — this is
 * the correct behavior, not a failure.
 * The keyed path follows LyricFind's documented search.do API (XML) and is
 * parsed defensively; it could not be exercised live here because no licensed
 * key was available in this environment.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText } = require('../http');
const { cleanText, decodeEntities } = require('../html');

const META = {
  id: 'lyricfind', name: 'LyricFind', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: false,
  apiSupported: true, scrapingSupported: false, priority: 3,
  needsKey: 'LYRICFIND_API_KEY',
  baseUrl: 'https://www.lyricfind.com', enabled: true,
};

const AUTH_NOTE = 'LyricFind requires LYRICFIND_API_KEY (licensed account)';

function xmlTrackList(xml) {
  // Minimal defensive parse of <track> entries in LyricFind search.do XML.
  const out = [];
  const re = /<track>([\s\S]*?)<\/track>/g;
  let m;
  const field = (block, name) => {
    const f = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>').exec(block);
    return f ? cleanText(decodeEntities(f[1])) : null;
  };
  while ((m = re.exec(xml)) && out.length < 50) {
    const b = m[1];
    out.push({
      title: field(b, 'title'),
      artist: field(b, 'artist') || field(b, 'artistname'),
      url: field(b, 'lyricurl') || field(b, 'url'),
      trackId: field(b, 'trackid') || field(b, 'id'),
    });
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const key = process.env.LYRICFIND_API_KEY;
  if (!key) {
    return { status: 'auth_required', results: [], note: AUTH_NOTE };
  }
  try {
    const url = 'https://api.lyricfind.com/search.do?q=' + encodeURIComponent(q)
      + '&apikey=' + encodeURIComponent(key) + '&format=json&all=0';
    const r = await fetchText(url, { timeout: 15000, accept: 'application/xml, text/xml, */*' });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return { status: 'auth_required', results: [], note: 'LYRICFIND_API_KEY rejected (HTTP ' + r.status + ')' };
      if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'LyricFind API timed out' };
      return { status: 'error', results: [], note: 'LyricFind API HTTP ' + r.status };
    }
    const tracks = xmlTrackList(r.text).slice(0, limit);
    return {
      status: 'ok',
      results: tracks.map((t) => ({
        title: t.title, artist: t.artist, artists: t.artist ? [t.artist] : [],
        album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
        genre: null, language: null, cover: null, label: null, writers: [],
        producers: [], url: t.url, sourceId: t.trackId, source: 'lyricfind',
        lyricsUrl: t.url, lyricsAvailable: true, licenseStatus: 'link-only', extra: {},
      })),
      note: 'via LyricFind licensed API',
    };
  } catch (err) {
    return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
  }
}

async function lookup(urlOrId, opts = {}) {
  // No public song pages; lookup is only meaningful via the licensed API.
  return null;
}

async function health() {
  const started = Date.now();
  if (!process.env.LYRICFIND_API_KEY) {
    return { status: 'auth_required', latencyMs: Date.now() - started, note: AUTH_NOTE };
  }
  const ms = Date.now() - started;
  return { status: 'healthy', latencyMs: ms, note: 'LYRICFIND_API_KEY present (licensed endpoint not probed without a query)' };
}

module.exports = { META, search, lookup, health };
