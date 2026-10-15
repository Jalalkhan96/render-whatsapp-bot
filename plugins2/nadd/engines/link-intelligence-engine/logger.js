'use strict';
// Structured [LINK] logging. Never logs secrets or raw sensitive query values.
const SENSITIVE = /(token|api[_-]?key|secret|password|auth)/i;
function safeMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    out[k] = SENSITIVE.test(k) ? '[REDACTED]' : v;
  }
  return out;
}
function fmt(meta) {
  return Object.entries(safeMeta(meta)).map(([k, v]) => `${k}=${v}`).join(' ');
}
const logger = {
  info(msg, meta) { console.log(`[LINK] ${msg}${meta ? ' ' + fmt(meta) : ''}`); },
  error(msg, meta) { console.error(`[LINK ERROR] ${msg}${meta ? ' ' + fmt(meta) : ''}`); },
  warn(msg, meta) { console.warn(`[LINK WARN] ${msg}${meta ? ' ' + fmt(meta) : ''}`); },
};
module.exports = logger;
