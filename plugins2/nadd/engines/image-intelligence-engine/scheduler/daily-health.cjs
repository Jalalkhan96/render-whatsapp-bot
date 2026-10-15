'use strict';
/**
 * Daily source health check: loops all enabled sources SEQUENTIALLY,
 * healthCheck = tiny search (limit 1, no downloads), writes
 * data/health-report.json per lib/report.js. Run via cron once a day.
 */
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry.js');
const { BaseImageSource } = require('../lib/base-source.js');
const { createTracker } = require('../lib/health.js');
const { dailyReport } = require('../lib/report.js');

(async () => {
  const sources = registry.all().filter((s) => s.enabled);
  const health = createTracker();
  for (const s of sources) {
    const w = new BaseImageSource(s._adapter, { health });
    try {
      const r = await w.healthCheck();
      console.log(`${s.id}: ${r.ok ? 'OK' : 'FAIL'} ${r.latencyMs}ms${r.ok ? ` (${r.results} result)` : ` — ${r.error}`}`);
    } catch (e) {
      console.log(`${s.id}: FAIL — ${String((e && e.message) || e).slice(0, 120)}`);
    }
  }
  const report = dailyReport(sources, health);
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'health-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    totalSources: report.totalSources, healthy: report.healthy,
    degraded: report.degraded, failed: report.failed,
    authRequired: report.authRequired, changed: report.changed,
    averageLatency: report.averageLatency,
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
