'use strict';
/**
 * Shazam audio-recognition adapter.
 *
 * Shazam's fingerprinting has NO public or keyless HTTP endpoint: recognition is
 * only available through an authorized ShazamKit / partner integration. This
 * adapter is therefore honest-by-design: without SHAZAM_API_KEY it reports
 * auth_required, and it never fakes a recognition result.
 * (Shazam charts live in the charts group, not here.)
 */

const { fetchText } = require('../http');

const META = {
  id: 'shazam',
  name: 'Shazam',
  type: 'recognition',
  country: 'US',
  languages: ['en'],
  searchSupported: false,
  directLookupSupported: false,
  apiSupported: false,
  scrapingSupported: false,
  priority: 2,
  needsKey: 'SHAZAM_API_KEY (authorized provider)',
  baseUrl: 'https://www.shazam.com',
  enabled: true,
};

const AUTH_NOTE =
  'Shazam audio recognition requires an authorized integration (SHAZAM_API_KEY); ' +
  'no public fingerprint endpoint exists.';

async function search() {
  return { status: 'auth_required', results: [], note: AUTH_NOTE };
}

async function lookup() {
  return null;
}

async function identify() {
  return { status: 'auth_required', track: null, confidence: null, note: AUTH_NOTE };
}

async function health() {
  const started = Date.now();
  // No public endpoint to probe; verify the service homepage is reachable so
  // the status reflects reality (blocked vs truly key-gated).
  let note = AUTH_NOTE;
  try {
    const r = await fetchText('https://www.shazam.com', { retries: 0, timeout: 12000 });
    if (r.status === 403 || r.status === 429 || (r.status === 0 && r.error === 'timeout')) {
      return { status: 'blocked', latencyMs: Date.now() - started, note: 'shazam.com unreachable (' + (r.status || r.error) + ') — ' + AUTH_NOTE };
    }
  } catch (e) {
    note += ' Homepage probe failed: ' + String((e && e.message) || e);
  }
  return { status: 'auth_required', latencyMs: Date.now() - started, note };
}

module.exports = { META, search, lookup, health, identify };
