'use strict';
// YOURLS adapter (https://yourls.org/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'yourls', name: 'YOURLS', domains: [], type: 'shortener', homepage: 'https://yourls.org/', kind: 'selfhosted' };
async function shorten() {
  return { ok: false, status: 'AUTH_REQUIRED', detail: 'YOURLS needs self-hosted endpoint / manual setup' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };