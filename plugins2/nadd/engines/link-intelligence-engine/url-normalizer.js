'use strict';
// normalizeUrl(url): canonical form without altering the semantic destination.
const punycode = require('punycode');
function normalizeUrl(input) {
  if (typeof input !== 'string') throw new Error('URL must be a string');
  let s = input.trim();
  if (!s) throw new Error('Empty URL');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'https://' + s; // missing scheme -> https
  const u = new URL(s);
  // lowercase host + punycode
  let host = u.hostname.toLowerCase();
  try { host = punycode.toASCII(host); } catch (_) {}
  u.hostname = host;
  // drop default ports
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
  // collapse duplicate query separators & drop empty pairs, keep order
  const pairs = [];
  for (const [k, v] of u.searchParams.entries()) pairs.push([k, v]);
  u.search = '';
  pairs.forEach(([k, v], i) => u.searchParams.append(k, v));
  if (u.pathname === '/') u.pathname = ''; // trailing slash: root only
  u.hash = ''; // strip fragment (client-side only)
  return u.toString();
}
module.exports = { normalizeUrl };
