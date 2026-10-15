'use strict';
/**
 * HindiSongsLyrics adapter.
 * Verified 2026-10-05: https://hindisongslyrics.com is a parked domain —
 * the homepage is a JS redirect to /lander serving a domain-parking page
 * (trafficz/parking lander markup). The lyrics site no longer exists at
 * this domain. This adapter reports the real state instead of fabricating
 * results:
 *   search() -> { status:'source_changed', results:[], note }
 *   health() -> { status:'source_changed', ... }
 * Re-verify before re-enabling (a moved/renamed successor domain may exist).
 */
const { fetchText } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'hindisongslyrics', name: 'HindiSongsLyrics', type: 'lyrics', country: 'IN',
  languages: ['hi', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 17, needsKey: null,
  baseUrl: 'https://hindisongslyrics.com', enabled: true,
};

function isParked(html) {
  return /window\.location\.href\s*=\s*["']\/lander["']/.test(html) ||
    /window\.LANDER_SYSTEM|_trfd\.push\(\{ap:"parking"\}/.test(html);
}

async function search(query, opts = {}) {
  const r = await fetchText(META.baseUrl, { retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'homepage timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  if (isParked(r.text)) {
    return {
      status: 'source_changed', results: [],
      note: 'hindisongslyrics.com is a parked domain (parking lander) as of 2026-10-05; lyrics site gone',
    };
  }
  return {
    status: 'source_changed', results: [],
    note: 'hindisongslyrics.com homepage structure changed; no recognizable search form — manual review needed',
  };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(META.baseUrl, { retries: 1 });
  const latencyMs = Date.now() - started;
  if (!r.ok) return { status: 'error', latencyMs, note: r.error || ('http_' + r.status) };
  if (isParked(r.text)) {
    return { status: 'source_changed', latencyMs, note: 'domain parked; lyrics site gone as of 2026-10-05' };
  }
  return { status: 'degraded', latencyMs, note: 'homepage reachable but structure unrecognized' };
}

module.exports = { META, search, lookup, health };
