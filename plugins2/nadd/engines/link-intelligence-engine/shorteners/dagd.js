'use strict';
// da.gd adapter (https://da.gd/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'dagd', name: 'da.gd', domains: ["da.gd"], type: 'shortener', homepage: 'https://da.gd/', kind: 'free' };
async function shorten(url) {
  try {
    const r = await get('https://da.gd/s?url=' + encodeURIComponent(url));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'dagd' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };