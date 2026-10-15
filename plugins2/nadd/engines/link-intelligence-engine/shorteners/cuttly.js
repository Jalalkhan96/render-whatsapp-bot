'use strict';
// Cuttly adapter (https://cutt.ly/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'cuttly', name: 'Cuttly', domains: ["cutt.ly","cut.ly"], type: 'shortener', homepage: 'https://cutt.ly/', kind: 'api' };
async function shorten(url, opts = {}) {
  const key = opts.key || process.env.CUTTLY_API_KEY;
  if (!key) return { ok: false, status: 'AUTH_REQUIRED', detail: 'Cuttly API key missing (CUTTLY_API_KEY)' };
  try {
    const r = await get('https://cutt.ly/api/api.php?key=' + encodeURIComponent(key) + '&short=' + encodeURIComponent(url), (t) => { try { const u = JSON.parse(t).url; return u && u.status === 7 ? { shortUrl: u.shortLink } : null; } catch (e) { return null; } });
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'cuttly' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };