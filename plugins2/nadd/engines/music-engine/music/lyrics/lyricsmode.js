'use strict';
/**
 * lyricsmode adapter — LyricsMode (https://www.lyricsmode.com)
 *
 * Verified live (2026-10-05):
 * - Search:  GET https://www.lyricsmode.com/search.php?search=<query>  (HTTP 200)
 * - Results: <div class="lm-list__row"> with subtitle cell (artist link) and
 *            title cell <a href="/lyrics/<l>/<artist>/<song>.html" ...>Title</a>
 * - Song page: JSON-LD schema.org MusicRecording (name, byArtist.name,
 *            image, url, datePublished)
 * Lyrics are link-only (licenseStatus 'link-only'); no lyric text is returned.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, jsonLdMusicNode } = require('../html');

const META = {
  id: 'lyricsmode',
  name: 'LyricsMode',
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 11,
  needsKey: null,
  baseUrl: 'https://www.lyricsmode.com',
  enabled: true,
};

const SEARCH_URL = META.baseUrl + '/search.php?search=';
// <div class="lm-list__row">
//   <div class="lm-list__cell lm-list__cell-subtitle"> <a ...> U2 </a> </div>
//   <div class="lm-list__cell lm-list__cell-title"> <a href="/lyrics/u/u2/city_of_blinding_lights.html" ...> City Of <b>Blinding</b> <b>Lights</b> </a> </div>
const ROW_RE = /<div class="lm-list__row">[\s\S]*?lm-list__cell-subtitle[\s\S]*?<a[^>]*>([^<]*)<\/a>[\s\S]*?lm-list__cell-title[\s\S]*?<a\b[^>]*?href="([^"]+?)"[^>]*>([\s\S]*?)<\/a>/gi;

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

function mapError(r) {
  if (!r || r.status === 0) {
    const e = (r && r.error) || 'unknown';
    return { status: e === 'timeout' ? 'timeout' : 'error', note: 'network error: ' + e };
  }
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    return { status: 'blocked', note: 'HTTP ' + r.status + ' from ' + META.baseUrl };
  }
  return { status: 'error', note: 'HTTP ' + r.status + ' from ' + META.baseUrl };
}

function songIdFromHref(href) {
  const m = /\/lyrics\/[a-z]\/([^\/]+)\/([^\/]+)\.html$/i.exec(href || '');
  return m ? m[1] + '/' + m[2] : '';
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(50, opts.limit || 8));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const started = Date.now();
  let r;
  try {
    r = await fetchText(SEARCH_URL + encodeURIComponent(q));
  } catch (e) {
    return Object.assign({ results: [] }, mapError({ status: 0, error: String(e && e.message) }));
  }
  if (!r.ok) return Object.assign({ results: [] }, mapError(r));
  if (!/lm-list/.test(r.text)) {
    return { status: 'source_changed', results: [], note: 'search result list markup not found (ms ' + (Date.now() - started) + ')' };
  }
  const results = [];
  ROW_RE.lastIndex = 0;
  let m;
  while ((m = ROW_RE.exec(r.text)) && results.length < limit) {
    const artist = cleanText(m[1]);
    const href = m[2];
    const title = cleanText(m[3]);
    if (!title || !/\/lyrics\//i.test(href)) continue;
    const url = absUrl(META.baseUrl, href);
    results.push(norm({
      title,
      artist,
      url,
      sourceId: songIdFromHref(href),
      extra: { searchMs: Date.now() - started },
    }));
  }
  return { status: 'ok', results };
}

function metaFromJsonLd(node) {
  const out = {};
  if (!node || typeof node !== 'object') return out;
  if (node.name) out.title = cleanText(node.name);
  const by = node.byArtist;
  if (by) out.artist = cleanText(typeof by === 'string' ? by : (by.name || ''));
  if (node.image) out.cover = absUrl(META.baseUrl, node.image);
  const dp = node.datePublished || '';
  const ym = /(\d{4})/.exec(String(dp));
  if (ym) { out.year = ym[1]; out.releaseDate = String(dp).slice(0, 10); }
  return out;
}

async function lookup(urlOrId, opts = {}) {
  const id = String(urlOrId || '').trim();
  if (!id) return null;
  const url = /^https?:\/\//i.test(id) ? id : absUrl(META.baseUrl, id.startsWith('/') ? id : '/' + id);
  let r;
  try {
    r = await fetchText(url);
  } catch (e) {
    return null;
  }
  if (!r.ok) return null;
  const html = r.text;
  const meta = metaFromJsonLd(jsonLdMusicNode(html));
  if (!meta.title) {
    // Fallback: "<title>City Of Blinding Lights lyrics by U2 - original song full text. ...</title>"
    const t = pageTitle(html);
    const m = /^(.+?)\s+lyrics\s+by\s+(.+?)\s*-/i.exec(t);
    if (m) { meta.title = cleanText(m[1]); meta.artist = cleanText(m[2]); }
  }
  if (!meta.title) return null;
  const finalUrl = r.finalUrl || url;
  return norm({
    title: meta.title,
    artist: meta.artist || '',
    album: meta.album || '',
    year: meta.year || '',
    releaseDate: meta.releaseDate || '',
    cover: meta.cover || '',
    url: finalUrl,
    sourceId: songIdFromHref(finalUrl) || songIdFromHref(url),
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
  if (r.ok) return { status: 'healthy', latencyMs, note: 'homepage reachable (HTTP 200)' };
  if (r.status === 401 || r.status === 403) {
    return { status: 'blocked', latencyMs, note: 'HTTP ' + r.status + ' (bot filtering)' };
  }
  return { status: 'error', latencyMs, note: 'HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
