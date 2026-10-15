'use strict';
// Short.io adapter (https://short.io/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'shortio', name: 'Short.io', domains: ["short.io"], type: 'shortener', homepage: 'https://short.io/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.SHORTIO_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Short.io API key missing (SHORTIO_API_KEY)' };
  try {
    const r = await post('https://api.short.io/links', { domain: 'short.io', originalURL: url }, { Authorization: key }, (j) => j.shortURL && ({ shortUrl: j.shortURL }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'shortio' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };