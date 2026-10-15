'use strict';
// Pixelfy adapter (https://pixelfy.me/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'pixelfy', name: 'Pixelfy', domains: ["pixelfy.me"], type: 'shortener', homepage: 'https://pixelfy.me/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.PIXELFY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Pixelfy API key missing (PIXELFY_API_KEY)' };
  try {
    const r = ({ ok: false, status: 'NOT_IMPLEMENTED' });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'pixelfy' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };