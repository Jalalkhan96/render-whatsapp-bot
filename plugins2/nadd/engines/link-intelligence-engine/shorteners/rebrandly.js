'use strict';
// Rebrandly adapter (https://www.rebrandly.com/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'rebrandly', name: 'Rebrandly', domains: ["rb.gy","rebrand.ly"], type: 'shortener', homepage: 'https://www.rebrandly.com/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.REBRANDLY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Rebrandly API key missing (REBRANDLY_API_KEY)' };
  try {
    const r = await post('https://api.rebrandly.com/v1/links', { destination: url }, { apikey: key }, (j) => j.shortUrl && ({ shortUrl: 'https://' + j.shortUrl }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'rebrandly' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };