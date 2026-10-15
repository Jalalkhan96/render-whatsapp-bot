'use strict';
// Provider health: healthy/degraded/timeout/changed/inactive/auth_required/interaction_required
const https = require('https');
const http = require('http');
const logger = require('./logger');
const health = new Map(); // id -> { status, lastSuccess, lastFailure, errorCount, averageLatency, consecutiveFails }
function record(id, ok, latencyMs, statusOverride) {
  const h = health.get(id) || { status: 'unknown', errorCount: 0, averageLatency: 0, samples: 0 };
  h.samples++;
  if (ok) {
    h.status = statusOverride || 'healthy'; h.lastSuccess = new Date().toISOString();
    h.averageLatency = Math.round(h.averageLatency * 0.7 + latencyMs * 0.3);
    h.consecutiveFails = 0;
  } else {
    h.consecutiveFails = (h.consecutiveFails || 0) + 1;
    h.errorCount++; h.lastFailure = new Date().toISOString();
    h.status = statusOverride || (h.consecutiveFails >= 3 ? 'inactive' : 'degraded');
  }
  health.set(id, h);
  return h;
}
function get(id) { return health.get(id) || { status: 'unknown', errorCount: 0 }; }
function all() { return Object.fromEntries(health); }
function ping(url, timeout = 8000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: 'HEAD', headers: { 'User-Agent': 'MyApp-LinkResolver/1.0' }, timeout },
      (res) => { res.resume(); resolve({ ok: res.statusCode < 500, status: res.statusCode, ms: Date.now() - t0 }); });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout', ms: Date.now() - t0 }); });
    req.on('error', (e) => resolve({ ok: false, status: 'error', ms: Date.now() - t0, detail: e.message }));
    req.end();
  });
}
async function checkProvider(p) {
  // Verifies availability live; never hard-codes active from a list.
  const r = await ping(p.healthUrl || p.homepage);
  record(p.id, r.ok, r.ms, r.ok ? 'healthy' : (r.status === 'timeout' ? 'timeout' : 'degraded'));
  logger.info('health check', { provider: p.id, status: get(p.id).status, ms: r.ms });
  return get(p.id);
}
module.exports = { record, get, all, checkProvider, ping };
if (require.main === module) {
  (async () => {
    const { providers } = require('./providers/registry');
    for (const p of providers) { await checkProvider(p); }
    console.log(JSON.stringify(all(), null, 2));
  })();
}
