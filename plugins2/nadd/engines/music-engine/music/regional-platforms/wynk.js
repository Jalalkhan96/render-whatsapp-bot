'use strict';
/**
 * Wynk Music adapter — India (regional-platforms).
 * Verified live 2026-10-05: wynk.in serves a JS app shell; /music/search/<q>
 * redirects to /music with no server-rendered results. Search data comes from
 * a tokenized internal API (AirTel session tokens), which cannot be called
 * from this VM without a user session. Honest status: 'blocked'.
 */
const { fetchText } = require('../http');

const META = {
  id: 'wynk', name: 'Wynk Music', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'pa', 'te', 'ta', 'mr', 'bn'],
  searchSupported: false, directLookupSupported: false,
  apiSupported: false, scrapingSupported: false, priority: 8, needsKey: null,
  baseUrl: 'https://wynk.in', enabled: true,
};

const NOTE = 'Wynk search data loads via a tokenized internal API (Airtel session tokens); the public site serves only a JS shell with no server-rendered results (verified 2026-10-05).';

async function search(query, opts = {}) {
  return { status: 'blocked', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const t = Date.now();
  const r = await fetchText('https://wynk.in/music', { retries: 0 });
  return {
    status: 'blocked',
    latencyMs: Date.now() - t,
    note: 'site reachable (HTTP ' + r.status + ' shell) but search is tokenized: ' + NOTE,
  };
}

module.exports = { META, search, lookup, health };
