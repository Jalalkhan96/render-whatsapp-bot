'use strict';
// Kutt adapter (https://kutt.it/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'kutt', name: 'Kutt', domains: ["kutt.it"], type: 'shortener', homepage: 'https://kutt.it/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.KUTT_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Kutt API key missing (KUTT_API_KEY)' };
  try {
    const r = await post('https://kutt.it/api/v2/links', { target: url }, { 'X-API-Key': key }, (j) => j.link && ({ shortUrl: j.link }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'kutt' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };