'use strict';
// BL.INK adapter (https://www.bl.ink/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'blink', name: 'BL.INK', domains: ["bl.ink"], type: 'shortener', homepage: 'https://www.bl.ink/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.BLINK_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'BL.INK API key missing (BLINK_API_KEY)' };
  try {
    const r = await post('https://api.bl.ink/v1/links', { url }, { Authorization: 'Bearer ' + key }, (j) => (j.short_url || j.link) && ({ shortUrl: j.short_url || j.link }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'blink' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };