'use strict';
/**
 * Tidal metadata adapter — honest skeleton.
 *
 * Live verification from this VM (2026-10-05):
 *   GET https://tidal.com/search?q=...       -> HTTP 403 (site blocks automated access)
 *   GET https://listen.tidal.com/search?q=... -> HTTP 301 -> tidal.com (same block)
 *   GET https://api.tidal.com/v1/search?q=... -> HTTP 400 (OAuth bearer token required; no keyless endpoint)
 *
 * Tidal offers no public/keyless metadata API, and its website blocks scraping
 * from this network. Every function therefore returns the honest status below
 * instead of fake data. Metadata requires an authorized Tidal integration
 * (OAuth client credentials + a signed token), which is outside a keyless adapter.
 */
const { fetchText } = require('../http');

const META = {
  id: 'tidal', name: 'Tidal', type: 'metadata', country: 'NO',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: false, priority: 8, needsKey: null,
  baseUrl: 'https://tidal.com', enabled: true,
};

const NOTE = 'Tidal offers no public API; metadata requires an authorized Tidal integration (OAuth client credentials). Website scraping is also blocked (HTTP 403 from this network).';

async function search(query, opts = {}) {
  return { status: 'auth_required', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  // No keyless lookup exists; never fabricate a result.
  return null;
}

async function health() {
  // One quick liveness probe of the public homepage to classify network state,
  // without pretending it yields metadata.
  const t0 = Date.now();
  let siteStatus = 'unknown';
  try {
    const r = await fetchText('https://tidal.com/', { retries: 0 });
    siteStatus = `http_${r.status}`;
  } catch (e) {
    siteStatus = `fetch_error:${e.message}`;
  }
  return {
    status: 'auth_required',
    latencyMs: Date.now() - t0,
    note: `${NOTE} (site probe: ${siteStatus})`,
  };
}

module.exports = { META, search, lookup, health };
