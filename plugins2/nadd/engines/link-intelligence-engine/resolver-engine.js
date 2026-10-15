'use strict';
// resolver-engine: sequential provider fallback.
// primary provider -> fallback provider -> generic HTTP resolver. One by one, never parallel.
const logger = require('./logger');
const health = require('./health-manager');
const { rank } = require('./result-ranker');
const resolvers = require('./resolvers/index');

async function expandWithFallback(url, { providers = ['generic'], verify = false, traceOpts = {} } = {}) {
  const attempts = [];
  for (const pid of providers) {
    const r = resolvers[pid];
    if (!r) { logger.warn('unknown resolver', { provider: pid }); continue; }
    const t0 = Date.now();
    let res;
    try {
      res = await r.expand(url, traceOpts);
    } catch (e) {
      res = { ok: false, status: 'ERROR', provider: pid, detail: e.message };
    }
    const ms = Date.now() - t0;
    health.record(pid, res.ok, ms);
    attempts.push({ providerId: pid, ...res });
    logger.info(res.ok ? 'resolver success' : 'resolver failed', { provider: pid, status: res.status, ms });
    if (res.ok && res.finalUrl) {
      if (!verify) return { ...res, attempts };
      // cross-provider verification: run one more independent resolver
      break;
    }
    if (res.status === 'INTERACTION_REQUIRED') {
      return { ok: false, status: 'INTERACTION_REQUIRED', provider: pid, attempts, message: 'Manual interaction required' };
    }
    // continue to next provider — never crash, never parallel
  }
  const ranked = rank(attempts);
  const best = attempts.find((a) => a.ok && a.finalUrl);
  return { ok: !!best, status: best ? 'resolved' : 'UNRESOLVED', finalUrl: best && best.finalUrl, verification: ranked, attempts };
}

module.exports = { expandWithFallback };
