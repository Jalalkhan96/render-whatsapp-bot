'use strict';
/**
 * Coke Studio Pakistan adapter — Pakistan (regional-platforms).
 * Verified live 2026-10-05: the standalone cokestudio.com.pk domain no longer
 * exists as a catalog site — http://cokestudio.com.pk/ 301-redirects to
 * https://www.coca-cola.com/pk/en (HTTPS connections to the old domain are
 * reset), and the old season/episode/song pages are gone. Coke Studio content
 * now appears only as promo/news articles on coca-cola.com/pk, with no
 * server-rendered song catalog or search. Honest status: 'source_changed'.
 */
const { fetchText } = require('../http');

const META = {
  id: 'cokestudio-pk', name: 'Coke Studio Pakistan', type: 'regional-platforms', country: 'PK',
  languages: ['ur', 'pa', 'en'],
  searchSupported: false, directLookupSupported: false,
  apiSupported: false, scrapingSupported: false, priority: 2, needsKey: null,
  baseUrl: 'https://cokestudio.com.pk', enabled: true,
};

const NOTE = 'cokestudio.com.pk now 301-redirects to coca-cola.com/pk/en; the standalone season/episode/song catalog no longer exists and the new home exposes no server-rendered search (verified 2026-10-05).';

async function search(query, opts = {}) {
  return { status: 'source_changed', results: [], note: NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const t = Date.now();
  const r = await fetchText('http://cokestudio.com.pk/', { retries: 0, timeout: 12000 });
  return {
    status: 'source_changed',
    latencyMs: Date.now() - t,
    note: 'HTTP ' + r.status + ' → ' + (r.finalUrl || 'unknown') + ' — ' + NOTE,
  };
}

module.exports = { META, search, lookup, health };
