'use strict';

// Safe-only registry. Adult video/gallery sites are deliberately not exposed.
const sites = Object.freeze([
  { key: 'webtoons', label: 'WEBTOON', domain: 'https://www.webtoons.com/', searchCmd: 'ppwebtoon', kind: 'comic' },
  { key: 'tapas', label: 'Tapas', domain: 'https://tapas.io/', searchCmd: 'pptapas', kind: 'comic' },
]);
const byKey = new Map(sites.map(site => [site.key, site]));
function getSite(value) { return byKey.get(String(value || '').trim().toLowerCase()) || null; }
function siteListText(prefix = '-') {
  return ['*SAFE COMICS*', ...sites.map((site, i) => `${i + 1}. ${site.label} → ${prefix}${site.searchCmd} <search>`)].join('\\n');
}
async function checkHome(site, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(site.domain, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'ABIX-Safe-Comic-Diagnostic/1.0' } });
    return { ok: response.ok || response.status < 500, status: response.status, statusText: response.statusText, latency: Date.now() - started, finalUrl: response.url || site.domain };
  } catch (error) {
    return { ok: false, status: 0, statusText: error?.name === 'AbortError' ? 'TIMEOUT' : (error?.message || 'FETCH_ERROR'), latency: Date.now() - started, finalUrl: site.domain };
  } finally { clearTimeout(timer); }
}
module.exports = { sites, getSite, siteListText, checkHome };
