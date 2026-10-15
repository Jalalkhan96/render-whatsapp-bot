'use strict';
/**
 * elyrics adapter — eLyrics (https://www.elyrics.net)
 *
 * Verified live (2026-10-05):
 * - Search is POST-only (form action /find.php, method=post, fields q+postcheck).
 *   POST requests hang without response from this network (connection dropped
 *   after 25s+; repeated with retries), and GET /find.php?q= renders no results
 *   (query echoed only in <title>, result list absent). search() therefore
 *   reports 'blocked' honestly rather than returning empty data.
 * - Direct song-page lookup works: GET /read/<l>/<artist>-lyrics/<song>-lyrics.html
 *   (HTTP 200) with OpenGraph tags: og:title "<TITLE> Lyrics - <ARTIST> |
 *   eLyrics.net", og:image, og:url.
 * Lyrics are link-only (licenseStatus 'link-only'); no lyric text is returned.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, openGraph } = require('../html');

const META = {
  id: 'elyrics',
  name: 'eLyrics',
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 12,
  needsKey: null,
  baseUrl: 'https://www.elyrics.net',
  enabled: true,
};

const SEARCH_BLOCK_NOTE =
  'search is POST-only (/find.php); POST requests hang/are dropped from this network ' +
  'and GET renders no results, so automated search is blocked. Direct song-page lookup works.';

function norm(o) {
  const artist = o.artist || '';
  return {
    title: o.title || '',
    artist,
    artists: artist ? [artist] : [],
    album: o.album || '',
    durationMs: null,
    releaseDate: o.releaseDate || '',
    year: o.year || '',
    isrc: '',
    genre: '',
    language: 'en',
    cover: o.cover || '',
    label: '',
    writers: [],
    producers: [],
    url: o.url || '',
    sourceId: o.sourceId || '',
    source: META.id,
    lyricsUrl: o.url || '',
    lyricsAvailable: true,
    licenseStatus: 'link-only',
    snippet: '',
    extra: o.extra || {},
  };
}

async function search(query, opts = {}) {
  return { status: 'blocked', results: [], note: SEARCH_BLOCK_NOTE };
}

function songIdFromUrl(u) {
  const m = /\/read\/([a-z]\/[^?#]+?)(?:-lyrics\.html)?$/i.exec(u || '');
  return m ? m[1].replace(/-lyrics\.html$/i, '') : '';
}

// og:title e.g. "JUST LIKE RAIN Lyrics - GLENN MEDEIROS | eLyrics.net"
function titleArtistFromPage(og, fallbackTitle) {
  const t = og['og:title'] || fallbackTitle || '';
  const m = /^(.*?)\s+lyrics\s*-\s*(.*?)\s*\|\s*elyrics/i.exec(t);
  if (m) return { title: cleanText(m[1]), artist: cleanText(m[2]) };
  return { title: '', artist: '' };
}

async function lookup(urlOrId, opts = {}) {
  const id = String(urlOrId || '').trim();
  if (!id) return null;
  const url = /^https?:\/\//i.test(id) ? id : absUrl(META.baseUrl, id.startsWith('/') ? id : '/read/' + id);
  let r;
  try {
    r = await fetchText(url);
  } catch (e) {
    return null;
  }
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  const ta = titleArtistFromPage(og, pageTitle(html));
  if (!ta.title) return null;
  const finalUrl = r.finalUrl || url;
  return norm({
    title: ta.title,
    artist: ta.artist,
    cover: og['og:image'] ? absUrl(META.baseUrl, og['og:image']) : '',
    url: og['og:url'] ? absUrl(META.baseUrl, og['og:url']) : finalUrl,
    sourceId: songIdFromUrl(finalUrl) || songIdFromUrl(url),
  });
}

async function health() {
  const started = Date.now();
  let r;
  try {
    r = await fetchText(META.baseUrl + '/', { retries: 0 });
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - started, note: 'network error: ' + String((e && e.message) || e) };
  }
  const latencyMs = Date.now() - started;
  if (r.ok) return { status: 'healthy', latencyMs, note: 'homepage reachable (HTTP 200); automated POST search blocked, lookup OK' };
  if (r.status === 401 || r.status === 403) {
    return { status: 'blocked', latencyMs, note: 'HTTP ' + r.status + ' (bot filtering)' };
  }
  return { status: 'error', latencyMs, note: 'HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
