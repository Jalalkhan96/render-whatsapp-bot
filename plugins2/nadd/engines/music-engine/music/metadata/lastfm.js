'use strict';
/**
 * Last.fm metadata adapter.
 *
 * Two paths (verified live from this VM):
 *  - API path (when LASTFM_API_KEY is set): official ws.audioscrobbler.com
 *    2.0 API (track.search / artist.search / artist.getInfo / album.getInfo /
 *    track.getInfo). Without a key the endpoint answers 400
 *    {"message":"Invalid parameters...","error":6}.
 *  - Website path (no key): https://www.last.fm/search?q=Q returns HTTP 200
 *    with server-rendered chartlist rows (data-track-name, data-artist-name,
 *    data-track-url, data-youtube-id, chartlist-name/artist anchors,
 *    chartlist-duration). Direct /music/* pages and /search/artists|albums
 *    serve a "Client Challenge" bot check to datacenter clients, so without
 *    a key only track search is available.
 */
const { fetchText, fetchJson } = require('../http');
const { cleanText, absUrl, decodeEntities, durationToMs, pageTitle } = require('../html');

const META = {
  id: 'lastfm', name: 'Last.fm', type: 'metadata', country: 'UK',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 9,
  needsKey: 'LASTFM_API_KEY (optional)',
  baseUrl: 'https://www.last.fm', enabled: true,
};

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

function apiKey() { return process.env.LASTFM_API_KEY || null; }

function isChallenged(r) {
  return r && r.ok && /Client Challenge/i.test(r.text || '');
}

function mapApiTrack(t) {
  if (!t) return null;
  const images = Array.isArray(t.image) ? t.image : [];
  const cover = (images.find((i) => i && i.size === 'extralarge') || images[images.length - 1] || {})['#text'] || null;
  return {
    title: cleanText(t.name || ''), artist: cleanText(t.artist || ''),
    artists: t.artist ? [cleanText(t.artist)] : [],
    album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
    genre: null, language: null, cover: cover || null, label: null,
    writers: [], producers: [], url: t.url || null, sourceId: t.url || null,
    source: 'lastfm',
    extra: { listeners: t.listeners ? parseInt(t.listeners, 10) : null, mbid: t.mbid || null },
  };
}

async function apiSearch(query, limit) {
  const qs = new URLSearchParams({
    method: 'track.search', track: query, api_key: apiKey(), format: 'json', limit: String(limit),
  });
  const r = await fetchJson(API_ROOT + '?' + qs.toString());
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) return { status: 'auth_required', results: [], note: 'Last.fm rejected the API key' };
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'Last.fm API timed out' };
    return { status: 'error', results: [], note: 'Last.fm API error: ' + (r.error || r.status) };
  }
  let tracks = (((r.data || {}).results || {}).trackmatches || {}).track || [];
  if (!Array.isArray(tracks)) tracks = [tracks];
  const results = tracks.map(mapApiTrack).filter(Boolean);
  return { status: 'ok', results, note: 'via Last.fm API' };
}

function parseWebsiteSearch(html, limit) {
  const out = [];
  const rowRe = /<tr[^>]*class="[^"]*chartlist-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) && out.length < limit) {
    const row = m[1];
    const get = (re) => { const x = re.exec(row); return x ? decodeEntities(x[1]) : ''; };
    const trackName = get(/data-track-name="([^"]*)"/i);
    const artistName = get(/data-artist-name="([^"]*)"/i);
    const trackUrl = get(/data-track-url="([^"]*)"/i);
    const youtubeId = get(/data-youtube-id="([^"]*)"/i);
    const nameCell = /<td[^>]*class="[^"]*chartlist-name[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    const artistCell = /<td[^>]*class="[^"]*chartlist-artist[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    const durCell = /<td[^>]*class="[^"]*chartlist-duration[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const title = cleanText(trackName || (nameCell ? nameCell[2] : ''));
    const artist = cleanText(artistName || (artistCell ? artistCell[2] : ''));
    if (!title) continue;
    const url = trackUrl ? absUrl(META.baseUrl, trackUrl) : (nameCell ? absUrl(META.baseUrl, nameCell[1]) : null);
    out.push({
      title, artist, artists: artist ? [artist] : [],
      album: null,
      durationMs: durCell ? durationToMs(cleanText(durCell[1])) : null,
      releaseDate: null, year: null, isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [],
      url, sourceId: trackUrl || url, source: 'lastfm',
      extra: youtubeId ? { youtubeId, youtubeUrl: 'https://www.youtube.com/watch?v=' + youtubeId } : {},
    });
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 8, 1), 25);
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  if (apiKey()) return apiSearch(String(query).trim(), limit);
  const started = Date.now();
  const r = await fetchText(META.baseUrl + '/search?q=' + encodeURIComponent(String(query).trim()));
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'Last.fm timed out' };
  if (!r.ok) return { status: 'error', results: [], note: 'Last.fm search HTTP ' + r.status };
  if (isChallenged(r)) return { status: 'blocked', results: [], note: 'Last.fm serves a bot challenge to automated clients; set LASTFM_API_KEY for API access' };
  const results = parseWebsiteSearch(r.text, limit);
  void started;
  return {
    status: 'ok', results,
    note: 'via last.fm website search (track results only); set LASTFM_API_KEY for artist/album search and richer metadata',
  };
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  let path = null;
  const urlM = /last\.fm(\/music\/[^?#]+)/i.exec(input);
  if (urlM) path = urlM[1];
  if (!apiKey()) {
    // Website track pages are challenge-blocked for datacenter clients; no key = no lookup.
    return null;
  }
  // API path: need artist + track from the URL path /music/Artist/_/Track
  let artist = null, track = null;
  if (path) {
    const pm = /^\/music\/([^/]+)\/_\/([^/]+)/i.exec(decodeURIComponent(path));
    if (pm) { artist = pm[1].replace(/\+/g, ' '); track = pm[2].replace(/\+/g, ' '); }
  }
  if (!artist || !track) return null;
  const qs = new URLSearchParams({
    method: 'track.getInfo', artist, track, api_key: apiKey(), format: 'json', autocorrect: '1',
  });
  const r = await fetchJson(API_ROOT + '?' + qs.toString());
  if (!r.ok || !r.data || !r.data.track) return null;
  const t = r.data.track;
  const tags = (((t.toptags || {}).tag) || []).map((x) => cleanText(x.name)).filter(Boolean);
  const album = t.album || {};
  const images = Array.isArray(album.image) ? album.image : [];
  const cover = (images.find((i) => i && i.size === 'extralarge') || images[images.length - 1] || {})['#text'] || null;
  return {
    title: cleanText(t.name || track), artist: cleanText((t.artist || {}).name || artist),
    artists: [cleanText((t.artist || {}).name || artist)],
    album: album.title ? cleanText(album.title) : null,
    durationMs: t.duration ? durationToMs(t.duration) : null,
    releaseDate: null, year: null, isrc: null, genre: tags[0] || null,
    language: null, cover: cover || null, label: null, writers: [], producers: [],
    url: t.url || (META.baseUrl + path), sourceId: t.url || path, source: 'lastfm',
    extra: {
      listeners: t.listeners ? parseInt(t.listeners, 10) : null,
      playcount: t.playcount ? parseInt(t.playcount, 10) : null,
      tags, mbid: t.mbid || null,
    },
  };
}

async function artistInfo(name) {
  const n = String(name || '').trim();
  if (!n) return { status: 'error', note: 'empty artist name' };
  if (!apiKey()) {
    const r = await fetchText(META.baseUrl + '/music/' + encodeURIComponent(n.replace(/\s+/g, '+')));
    if (isChallenged(r)) return { status: 'blocked', note: 'Last.fm serves a bot challenge to automated clients; set LASTFM_API_KEY for artist info' };
    if (!r.ok) return { status: 'error', note: 'Last.fm artist page HTTP ' + r.status };
    return { status: 'ok', artist: pageTitle(r.text).replace(/[-–|].*$/, '').trim() || n, note: 'page parse limited without API key' };
  }
  const qs = new URLSearchParams({ method: 'artist.getInfo', artist: n, api_key: apiKey(), format: 'json', autocorrect: '1' });
  const r = await fetchJson(API_ROOT + '?' + qs.toString());
  if (!r.ok || !r.data || !r.data.artist) return { status: 'error', note: 'Last.fm artist.getInfo failed' };
  const a = r.data.artist;
  const tags = (((a.tags || {}).tag) || []).map((x) => cleanText(x.name)).filter(Boolean);
  const similar = ((((a.similar || {}).artist) || [])).map((x) => cleanText(x.name)).filter(Boolean);
  return {
    status: 'ok', artist: cleanText(a.name || n),
    listeners: a.stats ? parseInt(a.stats.listeners, 10) : null,
    playcount: a.stats ? parseInt(a.stats.playcount, 10) : null,
    tags, similarArtists: similar,
    url: a.url || null, bio: a.bio ? cleanText((a.bio.summary || '').slice(0, 500)) : null,
    source: 'lastfm',
  };
}

async function albumInfo(artist, name) {
  const a = String(artist || '').trim(), n = String(name || '').trim();
  if (!a || !n) return { status: 'error', note: 'artist and album name required' };
  if (!apiKey()) return { status: 'blocked', note: 'Last.fm album pages are bot-challenged; set LASTFM_API_KEY for album info' };
  const qs = new URLSearchParams({ method: 'album.getInfo', artist: a, album: n, api_key: apiKey(), format: 'json', autocorrect: '1' });
  const r = await fetchJson(API_ROOT + '?' + qs.toString());
  if (!r.ok || !r.data || !r.data.album) return { status: 'error', note: 'Last.fm album.getInfo failed' };
  const al = r.data.album;
  const tags = (((al.tags || {}).tag) || []).map((x) => cleanText(x.name)).filter(Boolean);
  let tracks = (((al.tracks || {}).track) || []);
  if (!Array.isArray(tracks)) tracks = [tracks];
  return {
    status: 'ok', album: cleanText(al.name || n), artist: cleanText((al.artist || a)),
    listeners: al.listeners ? parseInt(al.listeners, 10) : null,
    playcount: al.playcount ? parseInt(al.playcount, 10) : null,
    tags, url: al.url || null, source: 'lastfm',
    extra: { tracks: tracks.map((t) => cleanText(t.name)).filter(Boolean) },
  };
}

async function health() {
  const started = Date.now();
  if (apiKey()) {
    const qs = new URLSearchParams({ method: 'track.search', track: 'test', api_key: apiKey(), format: 'json', limit: '1' });
    const r = await fetchJson(API_ROOT + '?' + qs.toString());
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'Last.fm API reachable' };
    if (r.status === 401 || r.status === 403) return { status: 'auth_required', latencyMs: ms, note: 'Last.fm rejected the API key' };
    return { status: 'error', latencyMs: ms, note: 'Last.fm API ' + (r.error || r.status) };
  }
  const r = await fetchText(META.baseUrl + '/search?q=test');
  const ms = Date.now() - started;
  if (r.ok && !isChallenged(r)) return { status: 'healthy', latencyMs: ms, note: 'website search page reachable (track search only without key)' };
  if (isChallenged(r)) return { status: 'blocked', latencyMs: ms, note: 'Last.fm bot challenge; set LASTFM_API_KEY' };
  return { status: 'error', latencyMs: ms, note: 'Last.fm search HTTP ' + r.status };
}

module.exports = { META, search, lookup, health, artistInfo, albumInfo };
