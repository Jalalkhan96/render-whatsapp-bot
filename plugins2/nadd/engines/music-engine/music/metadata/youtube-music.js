'use strict';
/**
 * YouTube Music metadata adapter (NO KEY needed for lookup).
 *
 * VERIFIED LIVE (2026-10-05):
 *  - https://www.youtube.com/oembed?url=<music.youtube.com/watch-url>&format=json
 *    returns HTTP 200 with title/author_name/author_url/thumbnail_url for a
 *    music.youtube.com watch URL (same oEmbed backend as YouTube).
 *  - music.youtube.com watch pages resolve to the same watch-page metadata
 *    as youtube.com (canonical video pages).
 *  - There is no public YouTube Music search API; with YOUTUBE_API_KEY set,
 *    search() uses the YouTube Data API v3 (same as the youtube adapter).
 *    Without a key, search() returns auth_required.
 */
const { fetchJson } = require('../http');
const yt = require('./youtube');

const META = {
  id: 'youtube-music', name: 'YouTube Music', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 11,
  needsKey: 'YOUTUBE_API_KEY (optional)',
  baseUrl: 'https://music.youtube.com', enabled: true,
};

const PROBE_VIDEO_ID = '4NRXx6U8ABQ';

function apiKey() { return process.env.YOUTUBE_API_KEY || null; }

async function search(query, opts = {}) {
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  if (!apiKey()) {
    return {
      status: 'auth_required', results: [],
      note: 'YouTube Music has no public search API; set YOUTUBE_API_KEY to search via YouTube Data API v3',
    };
  }
  const r = await yt.search(query, opts);
  if (r.status !== 'ok') return r;
  const results = r.results.map((t) => Object.assign({}, t, {
    source: 'youtube-music',
    url: 'https://music.youtube.com/watch?v=' + t.sourceId,
    extra: Object.assign({}, t.extra, { canonicalUrl: t.url }),
  }));
  return { status: 'ok', results, note: 'via YouTube Data API v3 (no public YouTube Music search API exists)' };
}

async function lookup(urlOrId, opts = {}) {
  const videoId = yt.extractVideoId(urlOrId);
  if (!videoId) return null;
  const t = await yt.lookup(videoId, opts);
  if (!t) return null;
  return Object.assign({}, t, {
    source: 'youtube-music',
    url: 'https://music.youtube.com/watch?v=' + videoId,
    extra: Object.assign({}, t.extra, { canonicalUrl: t.url }),
  });
}

async function health() {
  const started = Date.now();
  const r = await fetchJson('https://www.youtube.com/oembed?url='
    + encodeURIComponent('https://music.youtube.com/watch?v=' + PROBE_VIDEO_ID) + '&format=json');
  const ms = Date.now() - started;
  if (r.ok && r.data && r.data.title) return { status: 'healthy', latencyMs: ms, note: 'oEmbed resolves music.youtube.com URLs' };
  if (r.status === 401 || r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'oEmbed HTTP ' + r.status };
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', latencyMs: ms, note: 'unreachable' };
  return { status: 'error', latencyMs: ms, note: 'oEmbed ' + (r.error || r.status) };
}

module.exports = { META, search, lookup, health };
