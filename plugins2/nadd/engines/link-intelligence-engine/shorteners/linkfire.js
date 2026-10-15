'use strict';
// Linkfire adapter (https://www.linkfire.com/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'linkfire', name: 'Linkfire', domains: ["lnk.to"], type: 'music_smart_link', homepage: 'https://www.linkfire.com/', kind: 'expand_only' };
async function shorten() {
  return { ok: false, status: 'NOT_SUPPORTED', detail: 'Linkfire is expand/detect-only' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };