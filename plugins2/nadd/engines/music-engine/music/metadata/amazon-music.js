'use strict';
/**
 * Amazon Music metadata adapter.
 *
 * VERIFIED LIVE (2026-10-05): https://music.amazon.com/search/<q> returns
 * HTTP 200 but the body is a JS-rendered SPA shell (~11KB, no <title>, no
 * result markup of any kind). No results exist in the HTML, no public API
 * exists, and no keyless metadata endpoint (oEmbed/JSON-LD) is exposed.
 * Amazon blocks automated access from datacenters. This adapter therefore
 * reports honestly instead of fabricating results; no access control is
 * bypassed and no challenge is solved.
 */
const { fetchText } = require('../http');

const META = {
  id: 'amazon-music', name: 'Amazon Music', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: false,
  apiSupported: false, scrapingSupported: true, priority: 10,
  needsKey: null,
  baseUrl: 'https://music.amazon.com', enabled: true,
};

const BLOCK_NOTE = 'Amazon Music search is a JS-rendered SPA with no results in server HTML; '
  + 'Amazon blocks automated access from datacenters and offers no public metadata API.';

async function search(query, opts = {}) {
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  const r = await fetchText(META.baseUrl + '/search/' + encodeURIComponent(String(query).trim()));
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'music.amazon.com timed out' };
  if (!r.ok) return { status: 'blocked', results: [], note: 'music.amazon.com HTTP ' + r.status + '; ' + BLOCK_NOTE };
  // Look for any server-rendered result markup before giving up.
  const hasResults = /search-result|resultList|music-card|data-asin|trackRow/i.test(r.text || '');
  if (hasResults) {
    // Unexpected: markup changed. Do not guess a parse; report the change.
    return { status: 'source_changed', results: [], note: 'music.amazon.com now serves result markup; parser not implemented yet' };
  }
  return { status: 'blocked', results: [], note: BLOCK_NOTE };
}

async function lookup(urlOrId, opts = {}) {
  // Amazon Music album/track pages are the same JS SPA; no keyless metadata path.
  return null;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(META.baseUrl + '/');
  const ms = Date.now() - started;
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', latencyMs: ms, note: 'music.amazon.com unreachable' };
  if (r.ok) return { status: 'blocked', latencyMs: ms, note: 'site reachable but search/results require JS and are bot-walled; no public API' };
  return { status: 'blocked', latencyMs: ms, note: 'music.amazon.com HTTP ' + r.status };
}

module.exports = { META, search, lookup, health };
