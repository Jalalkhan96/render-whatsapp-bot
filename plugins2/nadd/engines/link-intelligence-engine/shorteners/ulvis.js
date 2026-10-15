'use strict';
// Ulvis adapter (https://ulvis.net/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'ulvis', name: 'Ulvis', domains: ["ulvis.net"], type: 'shortener', homepage: 'https://ulvis.net/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.ULVIS_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Ulvis API key missing (ULVIS_API_KEY)' };
  try {
    const r = ({ ok: false, status: 'NOT_IMPLEMENTED' });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'ulvis' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };