'use strict';
// Sink adapter (https://github.com/ccbikai/sink)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'sink', name: 'Sink', domains: [], type: 'shortener', homepage: 'https://github.com/ccbikai/sink', kind: 'selfhosted' };
async function shorten() {
  return { ok: false, status: 'AUTH_REQUIRED', detail: 'Sink needs self-hosted endpoint / manual setup' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };