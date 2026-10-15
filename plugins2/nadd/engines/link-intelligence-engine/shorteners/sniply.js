'use strict';
// Sniply adapter (https://sniply.io/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'sniply', name: 'Sniply', domains: ["sniply.io","snip.ly"], type: 'shortener', homepage: 'https://sniply.io/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.SNIPLY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Sniply API key missing (SNIPLY_API_KEY)' };
  try {
    const r = ({ ok: false, status: 'NOT_IMPLEMENTED' });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'sniply' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };