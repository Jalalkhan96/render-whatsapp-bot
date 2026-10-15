'use strict';
// Linkly adapter (https://linklyhq.com/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'linkly', name: 'Linkly', domains: ["linklyhq.com"], type: 'shortener', homepage: 'https://linklyhq.com/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.LINKLY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Linkly API key missing (LINKLY_API_KEY)' };
  try {
    const r = await post('https://app.linklyhq.com/api/v1/link', { url, api_key: key }, {}, (j) => j.full_url && ({ shortUrl: j.full_url }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'linkly' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };