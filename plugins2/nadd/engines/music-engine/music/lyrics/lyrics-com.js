'use strict';
/**
 * Lyrics.com adapter.
 * Verified live 2026-10-05 from this VM:
 *   Search: GET https://www.lyrics.com/serp.php?st=<Q>&stype=1  (HTTP 200)
 *   Result anchors look like /lyric/36706469/The+Weeknd/Blinding+Lights and
 *   /sublyric/77626/The+Weekend/Blinding+lights — artist and title are encoded
 *   in the URL path and parsed directly.
 * Song pages carry no JSON-LD/OG metadata; lookup parses the <h1> title and
 *   first <h3> artist heading.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText } = require('../http');
const { cleanText, absUrl, decodeEntities } = require('../html');

const META = {
  id: 'lyrics-com', name: 'Lyrics.com', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 4, needsKey: null,
  baseUrl: 'https://www.lyrics.com', enabled: true,
};

const SEARCH_URL = 'https://www.lyrics.com/serp.php?st=';

function pathName(seg) {
  return cleanText(decodeEntities(decodeURIComponent(String(seg || '').replace(/\+/g, ' '))));
}

function parseResult(href) {
  // href like /lyric/123/Artist+Name/Song+Title  or /sublyric/123/...
  const m = /^\/(sub)?lyric\/(\d+)\/([^\/\?#]+)\/([^\/\?#]+)/.exec(href || '');
  if (!m) return null;
  return { id: m[2], artist: pathName(m[3]), title: pathName(m[4]) };
}

function mapResult(parsed, href) {
  const url = absUrl('https://www.lyrics.com', href);
  return {
    title: parsed.title || null,
    artist: parsed.artist || null,
    artists: parsed.artist ? [parsed.artist] : [],
    album: null,
    durationMs: null,
    releaseDate: null,
    year: null,
    isrc: null,
    genre: null,
    language: 'en',
    cover: null,
    label: null,
    writers: [],
    producers: [],
    url,
    sourceId: parsed.id,
    source: 'lyrics-com',
    lyricsUrl: url,
    lyricsAvailable: true,
    licenseStatus: 'link-only',
    extra: {},
  };
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  try {
    const r = await fetchText(SEARCH_URL + encodeURIComponent(q) + '&stype=1', { timeout: 15000 });
    if (!r.ok) {
      if (r.status === 403) return { status: 'blocked', results: [], note: 'lyrics.com blocked this request (HTTP 403)' };
      if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'lyrics.com request timed out' };
      return { status: 'error', results: [], note: 'lyrics.com HTTP ' + r.status };
    }
    const results = [];
    const seen = new Set();
    const re = /<a\b[^>]*href=["']([^"']*\/(?:sub)?lyric\/\d+\/[^"']*)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(r.text)) && results.length < limit * 3) {
      const parsed = parseResult(m[1]);
      if (!parsed || !parsed.title) continue;
      const key = parsed.id + '|' + parsed.title + '|' + parsed.artist;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(mapResult(parsed, m[1]));
      if (results.length >= limit) break;
    }
    if (!results.length) {
      return { status: 'source_changed', results: [], note: 'lyrics.com SERP structure changed (no song links parsed)' };
    }
    return { status: 'ok', results };
  } catch (err) {
    return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
  }
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  try {
    let url = input;
    if (!/^https?:\/\//i.test(input)) {
      // Accept a /lyric/<id>/... path or treat as search fallback
      url = input.startsWith('/') ? absUrl('https://www.lyrics.com', input) : 'https://www.lyrics.com' + input;
    }
    const r = await fetchText(url, { timeout: 15000 });
    if (!r.ok || !r.text) return null;
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(r.text);
    const title = h1 ? cleanText(h1[1]) : null;
    const h3s = [];
    const h3re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    let hm;
    while ((hm = h3re.exec(r.text)) && h3s.length < 5) h3s.push(cleanText(hm[1]));
    const artist = h3s.find((t) => t && !/lyrics currently unavailable|citation|know any other/i.test(t)) || null;
    // Album best-effort from /album/ links
    const am = /<a[^>]*href=["'][^"']*\/album\/\d+\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(r.text);
    const album = am ? cleanText(am[1]) : null;
    const idm = /\/lyric\/(\d+)\//.exec(r.finalUrl || url);
    if (!title && !artist) return null;
    return {
      title: title || null, artist, artists: artist ? [artist] : [],
      album, durationMs: null, releaseDate: null, year: null, isrc: null,
      genre: null, language: 'en', cover: null, label: null,
      writers: [], producers: [],
      url: r.finalUrl || url, sourceId: idm ? idm[1] : null, source: 'lyrics-com',
      lyricsUrl: r.finalUrl || url, lyricsAvailable: true,
      licenseStatus: 'link-only', extra: {},
    };
  } catch (err) {
    return null;
  }
}

async function health() {
  const started = Date.now();
  try {
    const r = await fetchText(SEARCH_URL + 'test&stype=1', { timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'lyrics.com SERP reachable' };
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'lyrics.com blocked (HTTP 403)' };
    return { status: 'error', latencyMs: ms, note: 'HTTP ' + r.status };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - started, note: String((err && err.message) || err).slice(0, 120) };
  }
}

module.exports = { META, search, lookup, health };
