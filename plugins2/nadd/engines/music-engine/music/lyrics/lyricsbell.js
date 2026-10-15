'use strict';
/**
 * LyricsBell adapter — Hindi/Punjabi song lyrics directory (link-only).
 * Verified 2026-10-05: https://lyricsbell.com currently serves a GoDaddy
 * "Launching Soon" placeholder page (HTTP 200, no search form, no song
 * content). The lyrics site is offline/rebuilding. This adapter reports the
 * real state instead of fabricating results:
 *   search() -> { status:'source_changed', results:[], note }
 *   health() -> { status:'source_changed', ... }
 * Re-verify before re-enabling.
 */
const { fetchText } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'lyricsbell', name: 'LyricsBell', type: 'lyrics', country: 'IN',
  languages: ['hi', 'pa', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 16, needsKey: null,
  baseUrl: 'https://lyricsbell.com', enabled: true,
};

function isPlaceholder(html) {
  return /launching soon/i.test(html) && /lyricsbell\.com/i.test(cleanText(html).slice(0, 300));
}

async function search(query, opts = {}) {
  const r = await fetchText(META.baseUrl, { retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'homepage timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  if (isPlaceholder(r.text)) {
    return {
      status: 'source_changed', results: [],
      note: 'lyricsbell.com shows a "Launching Soon" placeholder page; the lyrics site is offline as of 2026-10-05',
    };
  }
  return {
    status: 'source_changed', results: [],
    note: 'lyricsbell.com homepage structure changed; no recognizable search form — manual review needed',
  };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(META.baseUrl, { retries: 1 });
  const latencyMs = Date.now() - started;
  if (!r.ok) return { status: r.error === 'timeout' ? 'error' : 'error', latencyMs, note: r.error || ('http_' + r.status) };
  if (isPlaceholder(r.text)) {
    return { status: 'source_changed', latencyMs, note: '"Launching Soon" placeholder; site offline as of 2026-10-05' };
  }
  return { status: 'degraded', latencyMs, note: 'homepage reachable but structure unrecognized' };
}

module.exports = { META, search, lookup, health };
