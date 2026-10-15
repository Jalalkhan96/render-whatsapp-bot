'use strict';
/** Daily health report (no full downloads — healthCheck uses a tiny search). */

function dailyReport(sources, health) {
  const counts = {
    healthy: 0, degraded: 0, failed: 0, authRequired: 0, changed: 0, unknown: 0,
  };
  let lat = 0, n = 0;
  const perSource = [];
  for (const s of sources) {
    const st = health.getStatus(s.id);
    const k = st.status;
    if (k === 'healthy') counts.healthy++;
    else if (k === 'degraded') counts.degraded++;
    else if (k === 'timeout' || k === 'inactive') counts.failed++;
    else if (k === 'auth_required') counts.authRequired++;
    else if (k === 'changed') counts.changed++;
    else counts.unknown++;
    if (st.latencyMs) { lat += st.latencyMs; n++; }
    perSource.push({ id: s.id, name: s.name, status: k, latencyMs: st.latencyMs, errorCount: st.errorCount });
  }
  return {
    totalSources: sources.length,
    healthy: counts.healthy,
    degraded: counts.degraded,
    failed: counts.failed,
    authRequired: counts.authRequired,
    changed: counts.changed,
    unknown: counts.unknown,
    averageLatency: n ? Math.round(lat / n) : 0,
    generatedAt: new Date().toISOString(),
    perSource,
  };
}

module.exports = { dailyReport };
