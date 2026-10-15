'use strict';
const net = require('net');
const punycode = require('punycode');
const TWO_PART_TLDS = new Set(['co.uk','org.uk','ac.uk','gov.uk','com.au','net.au','org.au','co.in',
  'co.jp','co.kr','com.br','com.pk','co.za','com.au','ne.jp','or.jp','go.jp','ac.in','gov.in']);
function registrableDomain(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(h)) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(last2) && parts.length >= 3) return parts.slice(-3).join('.');
  return last2;
}
function analyzeDomain(urlStr) {
  const u = new URL(urlStr);
  const hostname = u.hostname.toLowerCase();
  const signals = [];
  const isIp = net.isIP(hostname) !== 0;
  if (isIp) signals.push('ip_host');
  let ascii = hostname;
  try { ascii = punycode.toASCII(hostname); } catch (_) {}
  const isPuny = /xn--/.test(ascii);
  if (isPuny) signals.push('punycode');
  if (/[^\x00-\x7F]/.test(hostname)) signals.push('unicode_hostname');
  const labels = hostname.split('.');
  if (labels.length > 4) signals.push('deep_subdomain');
  if (u.username) signals.push('credentials_in_url');
  if (/(login|verify|secure|account|update|bank|paypal)-/.test(hostname) && !isIp) signals.push('lookalike_keyword');
  if (/[0-9]{4,}/.test(hostname)) signals.push('numeric_heavy');
  const tld = labels[labels.length - 1] || '';
  return {
    hostname, registrableDomain: registrableDomain(hostname), tld,
    https: u.protocol === 'https:', isIp, punycode: isPuny,
    subdomain: labels.length > 2, signals,
  };
}
function analyzeDestination(urlStr) {
  const u = new URL(urlStr);
  const d = analyzeDomain(urlStr);
  return {
    url: urlStr, domain: d.registrableDomain, hostname: d.hostname,
    path: u.pathname, query: u.search, scheme: u.protocol.replace(':', ''),
    ...d,
  };
}
module.exports = { analyzeDomain, analyzeDestination, registrableDomain };
