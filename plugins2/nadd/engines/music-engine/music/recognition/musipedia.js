'use strict';
/**
 * Musipedia melody-search adapter.
 *
 * Musipedia (https://www.musipedia.org) offers melody-based search (contour /
 * Parsons code, keyboard, whistle). VERIFIED LIVE 2026-10-05: the site sits
 * behind Cloudflare bot protection ("Just a moment..." 403) and serves no
 * usable search form over plain HTTP, so recognition/search via HTTP is not
 * possible. This adapter reports 'blocked' honestly instead of faking results.
 *
 * If the Cloudflare gate is ever removed and a form POST path becomes usable,
 * this is the adapter to extend (melody contour → results).
 */

const { fetchText } = require('../http');

const META = {
  id: 'musipedia',
  name: 'Musipedia',
  type: 'recognition',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: false,
  apiSupported: false,
  scrapingSupported: false,
  priority: 5,
  needsKey: null,
  baseUrl: 'https://www.musipedia.org',
  enabled: true,
};

const BLOCK_NOTE =
  'musipedia.org is behind Cloudflare bot protection (HTTP 403 "Just a moment..."); ' +
  'melodic search forms are not reachable over plain HTTP. Melody search requires an interactive browser.';

async function search(query, opts = {}) {
  const started = Date.now();
  // Re-probe once per call so recovery is picked up automatically.
  try {
    const r = await fetchText('https://www.musipedia.org', { retries: 0, timeout: 12000 });
    if (r.ok) {
      const form = /<form[^>]*>/i.test(r.text);
      return {
        status: 'source_changed',
        results: [],
        note: 'musipedia.org is reachable again but no usable melody-search form was found over HTTP (no browser).' + (form ? ' (a form exists — parser needed)' : ''),
        latencyMs: Date.now() - started,
      };
    }
  } catch (e) { /* fall through to blocked */ }
  return { status: 'blocked', results: [], note: BLOCK_NOTE, latencyMs: Date.now() - started };
}

async function lookup() {
  return null;
}

async function identify() {
  return { status: 'blocked', track: null, confidence: null, note: 'Musipedia works on melody contours, not audio fingerprints — and ' + BLOCK_NOTE };
}

async function health() {
  const started = Date.now();
  try {
    const r = await fetchText('https://www.musipedia.org', { retries: 1, timeout: 15000 });
    if (r.ok) {
      return { status: 'degraded', latencyMs: Date.now() - started, note: 'musipedia.org reachable over HTTP now; melody search needs form parsing + an interactive browser.' };
    }
    if (r.status === 403 && /just a moment|challenge/i.test(r.text)) {
      return { status: 'blocked', latencyMs: Date.now() - started, note: BLOCK_NOTE };
    }
    return { status: 'blocked', latencyMs: Date.now() - started, note: 'musipedia.org returned http ' + r.status + ' — ' + BLOCK_NOTE };
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - started, note: 'Health probe failed: ' + String((e && e.message) || e) };
  }
}

module.exports = { META, search, lookup, health, identify };
