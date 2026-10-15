'use strict';
// is.gd adapter (https://is.gd/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'isgd', name: 'is.gd', domains: ["is.gd"], type: 'shortener', homepage: 'https://is.gd/', kind: 'free' };
async function shorten(url) {
  try {
    const r = await get('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(url));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'isgd' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };