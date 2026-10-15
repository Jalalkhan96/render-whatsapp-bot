'use strict';
// ShortURL.at adapter (https://www.shorturl.at/)
const { get, post } = require('./_base');
const { traceRedirects } = require('../redirect-engine');
const META = { id: 'shorturlat', name: 'ShortURL.at', domains: ["shorturl.at"], type: 'shortener', homepage: 'https://www.shorturl.at/', kind: 'webform' };
async function shorten() {
  return { ok: false, status: 'AUTH_REQUIRED', detail: 'ShortURL.at needs self-hosted endpoint / manual setup' };
}
async function expand(url) {
  const t = await traceRedirects(url);
  return { ok: t.status === 'resolved', status: t.status, trace: t, finalUrl: t.finalUrl };
}
module.exports = { ...META, shorten, expand };