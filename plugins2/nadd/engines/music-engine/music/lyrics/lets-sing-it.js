'use strict';
/**
 * lets-sing-it adapter — Let's Sing It (https://letssingit.com)
 *
 * Status: BLOCKED. Verified live (2026-10-05): every request from this
 * environment — homepage, ?s= search, /search/ paths — returns HTTP 403
 * with a Cloudflare "Just a moment..." challenge page. The site filters
 * automated/datacenter traffic, so no search or lookup is possible.
 * Adapter kept as a stub that reports 'blocked' honestly.
 */
const { fetchText } = require('../http');

const META = {
  id: 'lets-sing-it',
  name: "Let's Sing It",
  type: 'lyrics',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 8,
  needsKey: null,
  baseUrl: 'https://letssingit.com',
  enabled: true,
};

const BLOCK_NOTE =
  "Cloudflare challenge (HTTP 403 'Just a moment...') on homepage and search endpoints; " +
  'automated requests from this network are blocked. Search pattern could not be verified.';

async function search(query, opts = {}) {
  return { status: 'blocked', results: [], note: BLOCK_NOTE };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function health() {
  const started = Date.now();
  let last = null;
  // Two attempts: the site flaps between HTTP 403 (challenge page) and
  // connection aborts — both are its Cloudflare bot filtering.
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetchText(META.baseUrl + '/', { retries: 0 });
      last = r;
      if (r.status === 403 || /Just a moment/i.test(r.text || '')) break;
    } catch (e) {
      last = { ok: false, status: 0 };
    }
    if (i === 0) await new Promise((res) => setTimeout(res, 1500));
  }
  const latencyMs = Date.now() - started;
  const challenged = last && (last.status === 403 || /Just a moment/i.test(last.text || ''));
  if (challenged) {
    return { status: 'blocked', latencyMs, note: BLOCK_NOTE };
  }
  if (last && last.ok) {
    return { status: 'healthy', latencyMs, note: 'homepage reachable (HTTP 200)' };
  }
  return {
    status: 'blocked',
    latencyMs,
    note: 'connection closed/aborted on repeat probes (HTTP ' + (last && last.status) +
      '); consistent with the Cloudflare challenge verified on this host — treated as blocked',
  };
}

module.exports = { META, search, lookup, health };
