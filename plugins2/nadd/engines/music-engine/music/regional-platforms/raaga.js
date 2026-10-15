'use strict';
/**
 * Raaga adapter — India (regional-platforms).
 * Verified live 2026-10-05: www.raaga.com returns HTTP 502 Bad Gateway from
 * the origin (Bunny CDN error page) on both the homepage and search paths.
 * The site is currently unreachable, so this adapter reports 'error' honestly.
 */
const { fetchText } = require('../http');

const META = {
  id: 'raaga', name: 'Raaga', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'ta', 'te', 'ml', 'kn', 'mr', 'bn', 'pa'],
  searchSupported: false, directLookupSupported: false,
  apiSupported: false, scrapingSupported: false, priority: 7, needsKey: null,
  baseUrl: 'https://www.raaga.com', enabled: true,
};

const NOTE = 'raaga.com origin returns HTTP 502 Bad Gateway (Bunny CDN error page); site unreachable from this VM (verified 2026-10-05).';

async function search(query, opts = {}) {
  return { status: 'error', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const t = Date.now();
  const r = await fetchText('https://www.raaga.com/', { retries: 0 });
  return {
    status: 'error',
    latencyMs: Date.now() - t,
    note: 'raaga.com HTTP ' + r.status + ' — ' + NOTE,
  };
}

module.exports = { META, search, lookup, health };
