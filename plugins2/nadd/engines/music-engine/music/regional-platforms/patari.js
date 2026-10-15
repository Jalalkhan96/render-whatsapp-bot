'use strict';
/**
 * Patari adapter — Pakistan (regional-platforms).
 * Verified live 2026-10-05: https://patari.pk/ TLS connections are reset by
 * the server (connection reset / empty reply); http://patari.pk/ returns only
 * a 612-byte placeholder page last modified 2018-04-17. The Patari web app is
 * currently unavailable, so this adapter reports 'error' honestly.
 */
const { fetchText } = require('../http');

const META = {
  id: 'patari', name: 'Patari', type: 'regional-platforms', country: 'PK',
  languages: ['ur', 'en', 'pa'],
  searchSupported: false, directLookupSupported: false,
  apiSupported: false, scrapingSupported: false, priority: 3, needsKey: null,
  baseUrl: 'https://patari.pk', enabled: true,
};

const NOTE = 'patari.pk TLS connections are reset (empty reply); HTTP serves only a 612-byte placeholder last modified 2018 — the Patari web app is unavailable (verified 2026-10-05).';

async function search(query, opts = {}) {
  return { status: 'error', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const t = Date.now();
  const r = await fetchText('http://patari.pk/', { retries: 0, timeout: 12000 });
  return {
    status: 'error',
    latencyMs: Date.now() - t,
    note: 'patari.pk HTTP ' + r.status + ' (placeholder page) — ' + NOTE,
  };
}

module.exports = { META, search, lookup, health };
