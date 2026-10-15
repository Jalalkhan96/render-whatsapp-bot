'use strict';
/**
 * lyrics-on-demand adapter — Lyrics On Demand (https://www.lyricsondemand.com)
 *
 * Verified live (2026-10-05):
 * - Search:  GET https://lyricsondemand.com/results?q=<query>  (HTTP 200; the
 *            site's own search form posts there with field q — no CSRF token
 *            needed; note the search host is the bare domain, no www)
 * - Results: <table id="results-songs"> rows:
 *            <td><a href="https://lyricsondemand.com/<artist>/<song>">
 *              <span class="bold">Title</span><br/>
 *              <span class="lyrics-results fineprint"><i>first-line snippet…</i></span>
 *            </a></td><td><a href="…/<artist>">Artist Name</a></td>
 *            (the #artistlist / #albumlist sections are artist/album pages,
 *            not lyric results, and are skipped)
 * - Song page: OpenGraph tags — og:title "Artist - Title Lyrics",
 *            og:image cover, og:url canonical
 * Lyrics are link-only (licenseStatus 'link-only'). The optional snippet
 * (<=160 chars) is taken only from text the site itself renders on its
 * search-results page. No lyric text is reconstructed or returned.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, openGraph } = require('../html');

const META = {
  id: 'lyrics-on-demand',
  name: 'Lyrics On Demand',
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 13,
  needsKey: null,
  baseUrl: 'https://www.lyricsondemand.com',
  enabled: true,
};

// Search lives on the bare domain (verified: form action is https://lyricsondemand.com/results).
const SEARCH_URL = 'https://lyricsondemand.com/results?q=';
const ROW_RE = /<tr>\s*<td>\s*<span class="songlink"><a href="([^"]+)"[^>]*>\s*<span class="bold">([\s\S]*?)<\/span>(?:\s*<br\s*\/?>\s*<span class="lyrics-results fineprint"><i>([\s\S]*?)<\/i><\/span>)?\s*<\/a>\s*<\/span>\s*<\/td>\s*<td>\s*<span class="songlink"><a href="[^"]+"[^>]*>([^<]+)<\/a>\s*<\/span>\s*<\/td>\s*<\/tr>/gi;

function norm(o) {
  const artist = o.artist || '';
  const out = {
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
    extra: o.extra || {},
  };
  if (o.snippet) out.snippet = o.snippet.slice(0, 160);
  return out;
}

function mapError(r) {
  if (!r || r.status === 0) {
    const e = (r && r.error) || 'unknown';
    return { status: e === 'timeout' ? 'timeout' : 'error', note: 'network error: ' + e };
  }
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    return { status: 'blocked', note: 'HTTP ' + r.status + ' from lyricsondemand.com' };
  }
  return { status: 'error', note: 'HTTP ' + r.status + ' from lyricsondemand.com' };
}

function songIdFromUrl(u) {
  const m = /lyricsondemand\.com\/([^?#]+)/i.exec(u || '');
  return m ? m[1].replace(/\/$/, '') : '';
}

function songTable(html) {
  const i = html.indexOf('id="results-songs"');
  if (i < 0) return '';
  const j = html.indexOf('</table>', i);
  return j > i ? html.slice(i, j) : html.slice(i);
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
  const table = songTable(r.text);
  if (!table) {
    return { status: 'source_changed', results: [], note: 'results-songs table not found (ms ' + (Date.now() - started) + ')' };
  }
  const results = [];
  ROW_RE.lastIndex = 0;
  let m;
  while ((m = ROW_RE.exec(table)) && results.length < limit) {
    const href = m[1];
    const title = cleanText(m[2]);
    const snippet = cleanText(m[3] || '');
    const artist = cleanText(m[4]);
    // Song links are two-segment /<artist>/<song>; single-segment links are artist pages.
    if (!title || !/^https?:\/\/lyricsondemand\.com\/[^\/]+\/[^\/]+/i.test(href)) continue;
    const url = absUrl(SEARCH_URL, href);
    results.push(norm({
      title,
      artist,
      url,
      sourceId: songIdFromUrl(href),
      snippet: snippet || '',
      extra: { searchMs: Date.now() - started },
    }));
  }
  return { status: 'ok', results };
}

// og:title e.g. "The Weeknd - Blinding Lights Lyrics"
function titleArtistFromOg(og) {
  const t = og['og:title'] || '';
  const m = /^(.*?)\s*-\s*(.*?)\s+lyrics$/i.exec(t);
  if (m) return { title: cleanText(m[2]), artist: cleanText(m[1]) };
  return { title: '', artist: '' };
}

async function lookup(urlOrId, opts = {}) {
  const id = String(urlOrId || '').trim();
  if (!id) return null;
  const url = /^https?:\/\//i.test(id)
    ? id
    : absUrl('https://lyricsondemand.com', id.startsWith('/') ? id : '/' + id);
  let r;
  try {
    r = await fetchText(url);
  } catch (e) {
    return null;
  }
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  let ta = titleArtistFromOg(og);
  if (!ta.title) {
    // Fallback: "<title>The Weeknd - Blinding Lights Lyrics - Lyrics On Demand</title>"
    const t = pageTitle(html);
    const m = /^(.*?)\s*-\s*(.*?)\s+lyrics(?:\s*-|$)/i.exec(t);
    if (m) ta = { title: cleanText(m[2]), artist: cleanText(m[1]) };
  }
  if (!ta.title) return null;
  const finalUrl = r.finalUrl || url;
  return norm({
    title: ta.title,
    artist: ta.artist,
    cover: og['og:image'] ? absUrl('https://lyricsondemand.com', og['og:image']) : '',
    url: og['og:url'] ? absUrl('https://lyricsondemand.com', og['og:url']) : finalUrl,
    sourceId: songIdFromUrl(finalUrl) || songIdFromUrl(url),
  });
}

async function health() {
  const started = Date.now();
  let r;
  try {
    r = await fetchText('https://lyricsondemand.com/', { retries: 0 });
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
