'use strict';
/**
 * JioSaavn adapter — India (regional-platforms).
 * Verified live 2026-10-05: public search API returns JSON, no key required.
 *   GET https://www.jiosaavn.com/api.php?__call=search.getResults&q=Q&p=1&_format=json&_marker=0&api_version=4&ctx=web6dot0
 * Song pages are JS shells; lookup() parses Open Graph tags instead.
 */
const { fetchJson, fetchText, sleep } = require('../http');
const { cleanText, openGraph, durationToMs } = require('../html');

const META = {
  id: 'jiosaavn', name: 'JioSaavn', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'pa', 'ur', 'te', 'ta', 'mr', 'bn'],
  searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 4, needsKey: null,
  baseUrl: 'https://www.jiosaavn.com', enabled: true,
};

const searchUrl = (q) =>
  'https://www.jiosaavn.com/api.php?__call=search.getResults&q=' + encodeURIComponent(q) +
  '&p=1&_format=json&_marker=0&api_version=4&ctx=web6dot0';

function names(list) {
  return (list || []).map((a) => (a && a.name ? cleanText(a.name) : '')).filter(Boolean);
}

function mapSong(r) {
  const mi = r.more_info || {};
  const am = mi.artistMap || {};
  const primary = names(am.primary_artists);
  const featured = names(am.featured_artists);
  const all = names(am.artists);
  const fallbackArtist = cleanText(String(r.subtitle || '').split(' - ')[0] || '');
  const artist = primary.join(', ') || featured.join(', ') || fallbackArtist;
  return {
    title: cleanText(r.title),
    artist,
    artists: primary.length ? primary : (featured.length ? featured : [fallbackArtist].filter(Boolean)),
    album: cleanText(mi.album || ''),
    durationMs: durationToMs(mi.duration),
    releaseDate: mi.release_date || null,
    year: r.year ? parseInt(r.year, 10) || null : null,
    isrc: null,
    genre: null,
    language: r.language || null,
    cover: r.image ? r.image.replace('-150x150.', '-500x500.') : null,
    label: cleanText(mi.label || '') || null,
    writers: [],
    producers: [],
    url: r.perma_url || null,
    sourceId: r.id || null,
    source: 'jiosaavn',
    extra: {
      type: r.type || 'song',
      featuredArtists: featured,
      allArtists: all,
      playCount: r.play_count ? parseInt(r.play_count, 10) || null : null,
      explicit: r.explicit_content === '1',
      hasLyrics: mi.has_lyrics === 'true',
    },
  };
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchJson(searchUrl(q), { retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'JioSaavn search API timed out' };
    return { status: 'error', results: [], note: 'JioSaavn search API HTTP ' + r.status + ' (' + (r.error || 'request failed') + ')' };
  }
  const list = Array.isArray(r.data && r.data.results) ? r.data.results : [];
  const out = [];
  for (const item of list) {
    if (!item || item.type !== 'song') continue;
    out.push(mapSong(item));
    if (out.length >= limit) break;
  }
  return { status: 'ok', results: out };
}

function extractToken(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (!s) return null;
  const m = /jiosaavn\.com\/song\/[^/]+\/([A-Za-z0-9_-]+)/i.exec(s);
  if (m) return { token: m[1], url: s };
  if (/^[A-Za-z0-9_-]{6,}$/.test(s)) return { token: s, url: 'https://www.jiosaavn.com/song/x/' + s };
  if (/^https?:\/\//i.test(s)) return { token: null, url: s };
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const ref = extractToken(urlOrId);
  if (!ref) return null;
  const r = await fetchText(ref.url, { retries: 1 });
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  const titleRaw = cleanText(og['og:title'] || '');
  // og:title looks like: "Title (Full Song) - Artist - Download or Listen Free - JioSaavn"
  let title = '', artist = '';
  const core = titleRaw.replace(/ - Download or Listen Free - JioSaavn$/i, '');
  const parts = core.split(' - ');
  if (parts.length >= 2) {
    title = parts[0].replace(/ \(Full Song\)$/i, '').trim();
    artist = parts.slice(1).join(' - ').trim();
  } else if (titleRaw) {
    title = titleRaw;
  }
  if (!title) return null;
  const desc = cleanText(og['og:description'] || '');
  const albumM = /music album (.+?) by /i.exec(desc);
  const out = {
    title: cleanText(title),
    artist: cleanText(artist),
    artists: artist ? [cleanText(artist)] : [],
    album: albumM ? cleanText(albumM[1]) : '',
    durationMs: durationToMs(og['music:duration']),
    releaseDate: null,
    year: null,
    isrc: null,
    genre: null,
    language: null,
    cover: og['og:image'] || null,
    label: null,
    writers: [],
    producers: [],
    url: og['og:url'] || ref.url,
    sourceId: ref.token,
    source: 'jiosaavn',
    extra: { type: 'song', ogDescription: desc.slice(0, 200) },
  };
  return out;
}

async function health() {
  const t = Date.now();
  const r = await fetchJson(searchUrl('Pasoori'), { retries: 0 });
  return {
    status: r.ok ? 'ok' : 'error',
    latencyMs: Date.now() - t,
    note: r.ok ? 'search API reachable (HTTP 200)' : 'search API HTTP ' + r.status + ' (' + (r.error || 'request failed') + ')',
  };
}

module.exports = { META, search, lookup, health };
