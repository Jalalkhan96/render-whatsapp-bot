'use strict';
// CleanURI adapter — free URL shortener, NO api key required.
// Live-verified: POST https://cleanuri.com/api/v1/shorten -> { result_url }
const { post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'cleanuri', name: 'CleanURI', domains: ['cleanuri.com'], type: 'shortener', homepage: 'https://cleanuri.com/', kind: 'free', noKey: true };
async function shorten(url) {
  try {
    const r = await post('https://cleanuri.com/api/v1/shorten', { url }, {}, (j) => j.result_url && ({ shortUrl: j.result_url }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'cleanuri' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };
