'use strict';
// URL validator: only http/https by default. Rejects dangerous schemes.
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'chrome:', 'about:', 'blob:', 'vbscript:'];
const ALLOWED = ['http:', 'https:'];
function validateUrl(input, opts = {}) {
  const allowed = opts.allowedSchemes || ALLOWED;
  if (typeof input !== 'string' || !input.trim()) return { valid: false, reason: 'empty_input' };
  let s = input.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'https://' + s;
  const scheme = s.split(':')[0].toLowerCase() + ':';
  if (BLOCKED_SCHEMES.includes(scheme)) return { valid: false, reason: 'blocked_scheme', scheme };
  if (!allowed.includes(scheme)) return { valid: false, reason: 'scheme_not_allowed', scheme };
  try {
    const u = new URL(s);
    if (!u.hostname) return { valid: false, reason: 'no_hostname' };
    if (u.username || u.password) return { valid: false, reason: 'credentials_in_url', warning: true };
    return { valid: true, scheme, hostname: u.hostname };
  } catch (e) {
    return { valid: false, reason: 'malformed', detail: e.message };
  }
}
module.exports = { validateUrl, BLOCKED_SCHEMES, ALLOWED };
