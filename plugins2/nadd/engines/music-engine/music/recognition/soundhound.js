'use strict';
/**
 * SoundHound audio-recognition adapter.
 *
 * SoundHound (Houndify) recognition requires a registered client id + key; there
 * is no public/keyless HTTP endpoint. Honest-by-design: without
 * SOUNDHOUND_CLIENT_ID / SOUNDHOUND_CLIENT_KEY it reports auth_required and
 * never fakes a recognition result.
 */

const { fetchText } = require('../http');

const META = {
  id: 'soundhound',
  name: 'SoundHound',
  type: 'recognition',
  country: 'US',
  languages: ['en'],
  searchSupported: false,
  directLookupSupported: false,
  apiSupported: false,
  scrapingSupported: false,
  priority: 3,
  needsKey: 'SOUNDHOUND_CLIENT_ID,SOUNDHOUND_CLIENT_KEY',
  baseUrl: 'https://www.soundhound.com',
  enabled: true,
};

const AUTH_NOTE =
  'SoundHound audio recognition requires a registered Houndify client ' +
  '(SOUNDHOUND_CLIENT_ID + SOUNDHOUND_CLIENT_KEY); no public recognition endpoint exists.';

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
  let note = AUTH_NOTE;
  try {
    const r = await fetchText('https://www.soundhound.com', { retries: 0, timeout: 12000 });
    if (r.status === 403 || r.status === 429 || (r.status === 0 && r.error === 'timeout')) {
      return { status: 'blocked', latencyMs: Date.now() - started, note: 'soundhound.com unreachable (' + (r.status || r.error) + ') — ' + AUTH_NOTE };
    }
  } catch (e) {
    note += ' Homepage probe failed: ' + String((e && e.message) || e);
  }
  return { status: 'auth_required', latencyMs: Date.now() - started, note };
}

module.exports = { META, search, lookup, health, identify };
