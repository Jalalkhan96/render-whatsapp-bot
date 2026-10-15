'use strict';
// Branch adapter (https://branch.io/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'branch', name: 'Branch', domains: ["bnc.lt","app.link"], type: 'app_deep_link', homepage: 'https://branch.io/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.BRANCH_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Branch API key missing (BRANCH_KEY)' };
  try {
    const r = ({ ok: false, status: 'NOT_IMPLEMENTED' });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'branch' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };