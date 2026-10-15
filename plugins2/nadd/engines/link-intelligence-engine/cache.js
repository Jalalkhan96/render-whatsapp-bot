'use strict';
// In-memory TTL cache for link resolutions. Failures cached briefly.
// Never caches private/authenticated links (caller must set private:true to skip).
const TTL = parseInt(process.env.LINK_CACHE_TTL || '21600', 10) * 1000;
const FAIL_TTL = parseInt(process.env.LINK_CACHE_FAIL_TTL || '600', 10) * 1000;
const store = new Map(); // key -> { value, expiresAt, status }
function keyFor(input) { return 'link:' + input; }
function get(input) {
  const e = store.get(keyFor(input));
  if (!e) return null;
  if (Date.now() > e.expiresAt) { store.delete(keyFor(input)); return null; }
  return e.value;
}
function set(input, value, opts = {}) {
  if (opts.private) return; // never cache private links
  const failed = value && (value.status === 'TIMEOUT' || value.status === 'ERROR' || value.status === 'DNS_FAILURE');
  store.set(keyFor(input), { value, expiresAt: Date.now() + (failed ? FAIL_TTL : TTL), status: value && value.status });
  if (store.size > 5000) { const k = store.keys().next().value; store.delete(k); }
}
function clear() { store.clear(); }
function stats() { return { size: store.size }; }
module.exports = { get, set, clear, stats };
