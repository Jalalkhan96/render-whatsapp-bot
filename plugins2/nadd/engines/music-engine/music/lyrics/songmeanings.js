'use strict';
/**
 * SongMeanings lyrics adapter.
 * Verified live 2026-10-05 from this VM:
 *   Search: GET https://songmeanings.com/query/?query=<Q>  (HTTP 200)
 *   Rows: <tr class="item"> with a song anchor (title attr), an optional
 *   lyric-line <div> snippet, and an artist anchor (title attr). The query page
 *   also exposes type links: type=songtitles | type=lyrics (seen in the page's
 *   own markup).
 * Snippets come ONLY from the site's own search page and are capped at 160 chars.
 * The song page doubles as the community-meaning page -> extra.meaningUrl.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText } = require('../http');
const { cleanText, openGraph } = require('../html');

const META = {
  id: 'songmeanings', name: 'SongMeanings', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 6, needsKey: null,
  baseUrl: 'https://songmeanings.com', enabled: true,
};

const QUERY_URL = 'https://songmeanings.com/query/?query=';

function attr(tag, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(tag);
  return m ? cleanText(m[1]) : null;
}

function parseRows(html, limit) {
  const results = [];
  const seen = new Set();
  const rowRe = /<tr class="item">([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(html)) && results.length < limit) {
    const body = row[1];
    const songA = /<a\b[^>]*href="([^"]*\/songs\/view\/\d+\/?)"[^>]*>/i.exec(body);
    if (!songA) continue;
    const url = songA[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const title = attr(songA[0], 'title') || cleanText(songA[0].replace(/<[^>]*>/g, ''));
    const artistA = /<a\b[^>]*href="([^"]*\/artist\/view\/songs\/\d+\/?)"[^>]*>/i.exec(body);
    const artist = artistA ? (attr(artistA[0], 'title') || null) : null;
    const snipM = /<div style="font-size:\s*90%;[^"]*">([\s\S]*?)<\/div>/i.exec(body);
    let snippet = snipM ? cleanText(snipM[1]) : null;
    if (snippet && snippet.length > 160) snippet = snippet.slice(0, 157) + '...';
    if (snippet === '') snippet = null;
    const idm = /\/songs\/view\/(\d+)\/?/.exec(url);
    const entry = {
      title: title || null, artist, artists: artist ? [artist] : [],
      album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
      genre: null, language: 'en', cover: null, label: null, writers: [],
      producers: [], url, sourceId: idm ? idm[1] : null, source: 'songmeanings',
      lyricsUrl: url, lyricsAvailable: true, licenseStatus: 'link-only',
      extra: { meaningUrl: url },
    };
    if (snippet) entry.snippet = snippet;
    results.push(entry);
  }
  return results;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  try {
    // Song-title table and lyric-line table both live on the same query page.
    const r = await fetchText(QUERY_URL + encodeURIComponent(q) + '&type=songtitles', { timeout: 15000 });
    if (!r.ok) {
      if (r.status === 403) return { status: 'blocked', results: [], note: 'songmeanings.com blocked this request (HTTP 403)' };
      if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'songmeanings.com request timed out' };
      return { status: 'error', results: [], note: 'songmeanings.com HTTP ' + r.status };
    }
    const results = parseRows(r.text, limit);
    if (!results.length) {
      return { status: 'source_changed', results: [], note: 'songmeanings.com query page structure changed (no rows parsed)' };
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
      url = /^\d+$/.test(input)
        ? 'https://songmeanings.com/songs/view/' + input + '/'
        : 'https://songmeanings.com' + (input.startsWith('/') ? input : '/' + input);
    }
    const r = await fetchText(url, { timeout: 15000 });
    if (!r.ok || !r.text) return null;
    const og = openGraph(r.text);
    let artist = null, title = null;
    const ogt = cleanText(og['og:title'] || '').replace(/\s*[|]\s*SongMeanings.*$/i, '').trim();
    // og:title pattern: "Artist - Title Lyrics & Meanings"
    const mm = /^(.*?)\s+-\s+(.*?)\s+Lyrics(?:\s*&\s*Meanings)?$/i.exec(ogt);
    if (mm) { artist = mm[1].trim(); title = mm[2].trim(); }
    const idm = /\/songs\/view\/(\d+)\/?/.exec(r.finalUrl || url);
    const pageUrl = og['og:url'] || r.finalUrl || url;
    if (!title && !artist) return null;
    return {
      title: title || null, artist, artists: artist ? [artist] : [],
      album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
      genre: null, language: 'en', cover: og['og:image'] || null, label: null,
      writers: [], producers: [],
      url: pageUrl, sourceId: idm ? idm[1] : null, source: 'songmeanings',
      lyricsUrl: pageUrl, lyricsAvailable: true, licenseStatus: 'link-only',
      extra: { meaningUrl: pageUrl },
    };
  } catch (err) {
    return null;
  }
}

async function health() {
  const started = Date.now();
  try {
    const r = await fetchText(QUERY_URL + 'test', { timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'songmeanings.com query reachable' };
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'songmeanings.com blocked (HTTP 403)' };
    return { status: 'error', latencyMs: ms, note: 'HTTP ' + r.status };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - started, note: String((err && err.message) || err).slice(0, 120) };
  }
}

module.exports = { META, search, lookup, health };
