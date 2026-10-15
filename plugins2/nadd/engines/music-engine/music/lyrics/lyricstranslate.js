'use strict';
/**
 * LyricsTranslate adapter.
 * Verified live 2026-10-05 from this VM: https://lyricstranslate.com/en/search?query=<Q>
 * returns HTTP 403 with a Cloudflare "Just a moment..." challenge page for this
 * datacenter IP. There is no public API, so translation language data
 * (extra.translationLanguages) cannot be collected from here.
 * This adapter reports 'blocked' honestly and never pretends to work; attempts
 * are single-shot (retries: 0).
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText } = require('../http');
const { cleanText, absUrl } = require('../html');

const META = {
  id: 'lyricstranslate', name: 'LyricsTranslate', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 5, needsKey: null,
  baseUrl: 'https://lyricstranslate.com', enabled: true,
};

const SEARCH_URL = 'https://lyricstranslate.com/en/search?query=';
const BLOCK_NOTE = 'lyricstranslate.com blocks datacenter IPs (HTTP 403 Cloudflare challenge); no public API exists, so translation availability cannot be read from this host';

function parseResults(html, limit) {
  // Song result cards link to /en/<artist>-<title>-lyrics.html style pages.
  const results = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']*\/en\/[^"']*-lyrics\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < limit) {
    const url = absUrl('https://lyricstranslate.com', m[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    const text = cleanText(m[2]).slice(0, 160);
    const parts = text.split(/\s+lyrics?\s*/i)[0].split(/\s*[-\u2013\u2014]\s*/);
    results.push({
      title: parts.length > 1 ? parts.slice(1).join(' - ') || null : text || null,
      artist: parts.length > 1 ? parts[0] || null : null,
      artists: parts.length > 1 && parts[0] ? [parts[0]] : [],
      album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
      genre: null, language: null, cover: null, label: null, writers: [],
      producers: [], url, sourceId: null, source: 'lyricstranslate',
      lyricsUrl: url, lyricsAvailable: true, licenseStatus: 'link-only',
      extra: { translationLanguages: [] },
    });
  }
  return results;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  try {
    const r = await fetchText(SEARCH_URL + encodeURIComponent(q), { timeout: 15000, retries: 0 });
    if (!r.ok) {
      if (r.status === 403) return { status: 'blocked', results: [], note: BLOCK_NOTE };
      if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'lyricstranslate.com request timed out' };
      return { status: 'blocked', results: [], note: BLOCK_NOTE + ' (HTTP ' + r.status + ')' };
    }
    const results = parseResults(r.text, limit);
    if (!results.length) {
      return { status: 'source_changed', results: [], note: 'lyricstranslate.com reachable but result structure changed' };
    }
    return { status: 'ok', results };
  } catch (err) {
    return { status: 'blocked', results: [], note: BLOCK_NOTE };
  }
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  try {
    const url = /^https?:\/\//i.test(input) ? input : absUrl('https://lyricstranslate.com', input.startsWith('/') ? input : '/' + input);
    const r = await fetchText(url, { timeout: 15000, retries: 0 });
    if (!r.ok || !r.text) return null; // blocked or unreachable -> null, honestly
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text);
    const titleRaw = t ? cleanText(t[1]).replace(/\s*[|\u2013-]\s*LyricsTranslate.*$/i, '').trim() : '';
    const mm = /^(.*?)\s+-\s+(.*?)\s+lyrics$/i.exec(titleRaw);
    const artist = mm ? mm[1].trim() : null;
    const title = mm ? mm[2].trim() : (titleRaw || null);
    if (!title && !artist) return null;
    // Translation language flags on the song page (best-effort).
    const langs = [];
    const langRe = /\/([a-z]{2})\/(?:[^"']*)-translation\.html/gi;
    let lm;
    const seenL = new Set();
    while ((lm = langRe.exec(r.text)) && langs.length < 40) {
      if (!seenL.has(lm[1])) { seenL.add(lm[1]); langs.push(lm[1]); }
    }
    return {
      title, artist, artists: artist ? [artist] : [], album: null, durationMs: null,
      releaseDate: null, year: null, isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [],
      url: r.finalUrl || url, sourceId: null, source: 'lyricstranslate',
      lyricsUrl: r.finalUrl || url, lyricsAvailable: true,
      licenseStatus: 'link-only',
      extra: { translationLanguages: langs },
    };
  } catch (err) {
    return null;
  }
}

async function health() {
  const started = Date.now();
  try {
    const r = await fetchText(SEARCH_URL + 'test', { timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'lyricstranslate.com reachable' };
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: BLOCK_NOTE };
    return { status: 'error', latencyMs: ms, note: 'HTTP ' + r.status };
  } catch (err) {
    return { status: 'blocked', latencyMs: Date.now() - started, note: BLOCK_NOTE };
  }
}

module.exports = { META, search, lookup, health };
