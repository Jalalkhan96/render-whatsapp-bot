'use strict';
// clck.ru adapter — free URL shortener by Yandex, NO api key required.
// Live-verified: GET https://clck.ru/--?url=<url> -> plain-text short URL.
const { get } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'clckru', name: 'clck.ru', domains: ['clck.ru'], type: 'shortener', homepage: 'https://clck.ru/', kind: 'free', noKey: true };
async function shorten(url) {
  try {
    const r = await get('https://clck.ru/--?url=' + encodeURIComponent(url), (t) => t.startsWith('http') && ({ shortUrl: t }));
    if (r.ok) return { ok: true, shortUrl: r.shortUrl, provider: 'clckru' };
    return { ok: false, status: r.status || 'API_ERROR', detail: r.detail };
  } catch (e) { return { ok: false, status: 'ERROR', detail: e.message }; }
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };
