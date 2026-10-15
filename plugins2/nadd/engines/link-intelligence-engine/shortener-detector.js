'use strict';
// Domain registry: known shortener/social-redirect domains + classification.
const shortDomains = {
  'bit.ly': 'bitly', 'bitly.com': 'bitly', 'j.mp': 'bitly',
  'tinyurl.com': 'tinyurl', 'tiny.one': 'tinyurl',
  't.co': 'twitter', 't.ly': 'tly',
  'cutt.ly': 'cuttly', 'cut.ly': 'cuttly',
  'rb.gy': 'rebrandly', 'rebrand.ly': 'rebrandly',
  'short.io': 'shortio',
  'lnk.to': 'linkfire',
  'lnkd.in': 'linkedin',
  'youtu.be': 'youtube', 'youtube.com': 'youtube',
  'ow.ly': 'owly', 'buff.ly': 'buffer', 'bit.do': 'bitdo',
  'is.gd': 'isgd', 'v.gd': 'vgd',
  'tiny.cc': 'tinycc', 'shorturl.at': 'shorturlat',
  'da.gd': 'dagd', 'ulvis.net': 'ulvis',
  'kutt.it': 'kutt', 'sniply.io': 'sniply', 't2m.io': 't2m',
  'geni.us': 'geniuslink', 'amzn.to': 'amazon',
};
const SOCIAL_REDIRECTS = new Set([
  'l.facebook.com', 'lm.facebook.com', 'l.instagram.com',
  'linkedin.com', 'youtu.be', 'youtube.com', 'google.com', 'wa.me', 't.me',
]);
function detectProvider(urlStr) {
  let host;
  try { host = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, ''); }
  catch (_) { return { provider: { name: 'Invalid', id: 'invalid', confidence: 0 } }; }
  if (shortDomains[host]) {
    const id = shortDomains[host];
    return { provider: { name: id[0].toUpperCase() + id.slice(1), id, confidence: 1 }, kind: 'known' };
  }
  // subdomain of known short domain (e.g. custom.bitly) or short-looking host
  for (const [dom, id] of Object.entries(shortDomains)) {
    if (host.endsWith('.' + dom)) return { provider: { name: id, id, confidence: 0.8 }, kind: 'known_subdomain' };
  }
  const path = new URL(urlStr).pathname;
  const looksShort = path.length <= 10 && /^\/[A-Za-z0-9_-]+\/?$/.test(path);
  if (SOCIAL_REDIRECTS.has(host) || host.endsWith('.facebook.com')) {
    return { provider: { name: 'SocialRedirect', id: 'social_redirect', confidence: 0.9 }, kind: 'social' };
  }
  if (looksShort) return { provider: { name: 'Unknown', id: 'unknown', confidence: 0 }, kind: 'unknown_short' };
  return { provider: { name: 'Unknown', id: 'unknown', confidence: 0 }, kind: 'unknown' };
}
function classify(urlStr, trace) {
  const labels = new Set();
  const { provider, kind } = detectProvider(urlStr);
  if (kind === 'known' || kind === 'known_subdomain' || kind === 'unknown_short') labels.add('shortened');
  if (kind === 'social') labels.add('social_redirect');
  if (trace && trace.hopCount > 0) labels.add('redirect');
  try {
    const { detectTracking } = require('./tracking-detector');
    const { detectAffiliate } = require('./affiliate/affiliate-detector');
    if (detectTracking(urlStr).detected) labels.add('tracking');
    if (detectAffiliate(urlStr).detected) labels.add('affiliate');
  } catch (_) {}
  if (labels.size === 0) labels.add('direct');
  return { labels: [...labels], provider };
}
module.exports = { shortDomains, detectProvider, classify, SOCIAL_REDIRECTS };
