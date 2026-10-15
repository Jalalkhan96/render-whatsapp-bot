'use strict';
// Polr adapter (https://polrproject.org/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'polr', name: 'Polr', domains: [], type: 'shortener', homepage: 'https://polrproject.org/', kind: 'selfhosted' };
async function shorten() {
  return { ok: false, status: 'AUTH_REQUIRED', detail: 'Polr needs self-hosted endpoint / manual setup' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };