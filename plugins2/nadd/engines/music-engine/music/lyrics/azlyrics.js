'use strict';
/**
 * AZLyrics adapter.
 * Verified live 2026-10-05 from this VM: https://search.azlyrics.com/search.php?q=<Q>
 * drops the connection outright (empty reply / connection reset) for this
 * datacenter IP. AZLyrics aggressively blocks datacenters and has no public
 * API, so this adapter reports 'blocked' honestly and never pretends to work.
 * Attempts are single-shot (retries: 0) — the site must not be hammered.
 * Lyrics are NEVER returned in full: link-only (lyricsUrl + licenseStatus).
 */

const { fetchText } = require('../http');

const META = {
  id: 'azlyrics', name: 'AZLyrics', type: 'lyrics', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 7, needsKey: null,
  baseUrl: 'https://www.azlyrics.com', enabled: true,
};

const SEARCH_URL = 'https://search.azlyrics.com/search.php?q=';
const BLOCK_NOTE = 'AZLyrics blocks datacenter IPs (connection refused/reset from this host) and offers no public API; retry from a residential IP or with a different egress';

async function search(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  try {
    const r = await fetchText(SEARCH_URL + encodeURIComponent(q), { timeout: 15000, retries: 0 });
    if (r.ok) {
      // Unexpectedly reachable — parse defensively; report honestly either way.
      const results = [];
      const re = /<a\b[^>]*href=["']([^"']*azlyrics\.com\/lyrics\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      const limit = Math.max(1, Math.min(opts.limit || 8, 20));
      while ((m = re.exec(r.text)) && results.length < limit) {
        const url = m[1];
        results.push({
          title: null, artist: null, artists: [], album: null, durationMs: null,
          releaseDate: null, year: null, isrc: null, genre: null, language: 'en',
          cover: null, label: null, writers: [], producers: [], url,
          sourceId: null, source: 'azlyrics', lyricsUrl: url,
          lyricsAvailable: true, licenseStatus: 'link-only', extra: {},
        });
      }
      if (!results.length) return { status: 'source_changed', results: [], note: 'azlyrics.com reachable but result structure changed' };
      return { status: 'ok', results, note: 'unexpectedly reachable; metadata limited' };
    }
    if (r.status === 403 || r.status === 0) return { status: 'blocked', results: [], note: BLOCK_NOTE };
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'azlyrics.com request timed out' };
    return { status: 'blocked', results: [], note: BLOCK_NOTE + ' (HTTP ' + r.status + ')' };
  } catch (err) {
    return { status: 'blocked', results: [], note: BLOCK_NOTE };
  }
}

async function lookup(urlOrId, opts = {}) {
  const input = String(urlOrId || '').trim();
  if (!input) return null;
  try {
    const url = /^https?:\/\//i.test(input) ? input : 'https://www.azlyrics.com' + (input.startsWith('/') ? input : '/' + input);
    const r = await fetchText(url, { timeout: 15000, retries: 0 });
    if (!r.ok || !r.text) return null; // blocked or unreachable -> null, honestly
    const m = /ArtistName\s*=\s*"([^"]+)"[\s\S]{0,400}SongName\s*=\s*"([^"]+)"/i.exec(r.text);
    const artist = m ? m[1] : null;
    const title = m ? m[2] : null;
    if (!artist && !title) return null;
    return {
      title, artist, artists: artist ? [artist] : [], album: null, durationMs: null,
      releaseDate: null, year: null, isrc: null, genre: null, language: 'en',
      cover: null, label: null, writers: [], producers: [],
      url: r.finalUrl || url, sourceId: null, source: 'azlyrics',
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
    const r = await fetchText(SEARCH_URL + 'test', { timeout: 10000, retries: 0 });
    const ms = Date.now() - started;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'azlyrics.com reachable' };
    return { status: 'blocked', latencyMs: ms, note: BLOCK_NOTE };
  } catch (err) {
    return { status: 'blocked', latencyMs: Date.now() - started, note: BLOCK_NOTE };
  }
}

module.exports = { META, search, lookup, health };
