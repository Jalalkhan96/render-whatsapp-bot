'use strict';
/**
 * Hungama Music adapter — India (regional-platforms).
 * Verified live 2026-10-05: the website serves only a JS app shell (HTTP 200,
 * no server-rendered results). Search data loads through a tokenized internal
 * XHR (session-signed), which cannot be called from this VM without a user
 * session. No public search endpoint exists, so this adapter reports 'blocked'
 * honestly instead of returning invented results.
 */
const { fetchText } = require('../http');

const META = {
  id: 'hungama', name: 'Hungama Music', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'pa', 'te', 'ta', 'mr', 'bn'],
  searchSupported: false, directLookupSupported: false,
  apiSupported: false, scrapingSupported: false, priority: 6, needsKey: null,
  baseUrl: 'https://www.hungama.com', enabled: true,
};

const NOTE = 'Hungama search results load via a tokenized internal API that requires a live user session; no public endpoint was found (verified 2026-10-05).';

async function search(query, opts = {}) {
  return { status: 'blocked', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const t = Date.now();
  const r = await fetchText('https://www.hungama.com/', { retries: 0 });
  return {
    status: 'blocked',
    latencyMs: Date.now() - t,
    note: 'site reachable (HTTP ' + r.status + ' shell) but search is tokenized: ' + NOTE,
  };
}

module.exports = { META, search, lookup, health };
