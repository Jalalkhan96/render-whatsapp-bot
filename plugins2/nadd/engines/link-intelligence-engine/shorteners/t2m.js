'use strict';
// T2M adapter (https://t2m.io/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 't2m', name: 'T2M', domains: ["t2m.io"], type: 'shortener', homepage: 'https://t2m.io/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.T2M_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'T2M API key missing (T2M_API_KEY)' };
  try {
    const r = ({ ok: false, status: 'NOT_IMPLEMENTED' });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 't2m' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };