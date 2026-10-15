'use strict';
// T.LY adapter (https://t.ly/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'tly', name: 'T.LY', domains: ["t.ly"], type: 'shortener', homepage: 'https://t.ly/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.TLY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'T.LY API key missing (TLY_API_KEY)' };
  try {
    const r = await post('https://t.ly/api/shorten', { long_url: url, api_token: key }, {}, (j) => j.short_url && ({ shortUrl: j.short_url }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'tly' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };