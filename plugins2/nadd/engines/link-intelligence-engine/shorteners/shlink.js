'use strict';
// Shlink adapter (https://shlink.io/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'shlink', name: 'Shlink', domains: [], type: 'shortener', homepage: 'https://shlink.io/', kind: 'selfhosted' };
async function shorten() {
  return { ok: false, status: 'AUTH_REQUIRED', detail: 'Shlink needs self-hosted endpoint / manual setup' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };