'use strict';
// Dub adapter (https://dub.co/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'dub', name: 'Dub', domains: ["dub.co","dub.sh"], type: 'shortener', homepage: 'https://dub.co/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.DUB_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Dub API key missing (DUB_API_KEY)' };
  try {
    const r = await post('https://api.dub.co/links', { url }, { Authorization: 'Bearer ' + key }, (j) => j.shortLink && ({ shortUrl: j.shortLink }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'dub' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };