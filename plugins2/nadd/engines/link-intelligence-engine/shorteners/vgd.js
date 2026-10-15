'use strict';
// v.gd adapter (https://v.gd/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'vgd', name: 'v.gd', domains: ["v.gd"], type: 'shortener', homepage: 'https://v.gd/', kind: 'free' };
async function shorten(url) {
  try {
    const r = await get('https://v.gd/create.php?format=simple&url=' + encodeURIComponent(url));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'vgd' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };