'use strict';
/* Tiny built-in scheduler — no external deps. Frequencies per MASTER PROMPT §18:
 * high: every 45 min, medium: every 4h, low: every 24h, plus a daily master run. */
const log = require('./logger.cjs');
const { ScraperManager } = require('./manager.cjs');
const registry = require('./registry.cjs');

const INTERVALS = {
  high: 45 * 60 * 1000,
  medium: 4 * 3600 * 1000,
  low: 24 * 3600 * 1000,
};

function frequencyOf(siteId) {
  try {
    const { adapter } = registry.getAdapter(siteId);
    return (adapter.schedule && adapter.schedule.frequency) || 'low';
  } catch (_) { return 'low'; }
}

function startScheduler(opts = {}) {
  const manager = new ScraperManager(opts);
  const timers = [];
  log.info('scheduler.start', {});

  const runFreq = async (freq) => {
    const ids = registry.listSites().map(s => s.id).filter(id => frequencyOf(id) === freq);
    log.info('scheduler.tick', { frequency: freq, sites: ids.length });
    for (const id of ids) {
      try { await manager.runSite(id, { runId: `sched-${freq}-${Date.now()}` }); }
      catch (err) { log.error('scheduler.site_error', { site: id, err: err.message }); }
    }
  };

  // Stagger initial runs so they don't all fire at once.
  const boot = async () => {
    await runFreq('high');
    timers.push(setInterval(() => runFreq('high'), INTERVALS.high));
    setTimeout(async () => {
      await runFreq('medium');
      timers.push(setInterval(() => runFreq('medium'), INTERVALS.medium));
    }, 5 * 60 * 1000);
    setTimeout(async () => {
      await runFreq('low');
      timers.push(setInterval(() => runFreq('low'), INTERVALS.low));
    }, 10 * 60 * 1000);
  };
  boot().catch(err => log.error('scheduler.boot', { err: err.message }));

  const dailyAtMidnight = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 5, 0);
    const ms = next - now;
    setTimeout(async () => {
      log.info('scheduler.daily_master_run', {});
      try { await manager.runAll({}); } catch (err) { log.error('scheduler.daily', { err: err.message }); }
      dailyAtMidnight();
    }, ms);
    log.info('scheduler.daily_scheduled', { inMs: ms });
  };
  dailyAtMidnight();

  const stop = () => { timers.forEach(clearInterval); manager.stop(); log.info('scheduler.stop', {}); };
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  return { stop, manager };
}

module.exports = { startScheduler, INTERVALS, frequencyOf };
