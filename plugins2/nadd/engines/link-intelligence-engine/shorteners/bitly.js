'use strict';
// Bitly adapter (https://bitly.com/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'bitly', name: 'Bitly', domains: ["bit.ly","bitly.com","j.mp"], type: 'shortener', homepage: 'https://bitly.com/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.BITLY_API_TOKEN;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Bitly API key missing (BITLY_API_TOKEN)' };
  try {
    const r = await post('https://api-ssl.bitly.com/v4/shorten', { long_url: url }, { Authorization: 'Bearer ' + key }, (j) => j.link && ({ shortUrl: j.link }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'bitly' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };