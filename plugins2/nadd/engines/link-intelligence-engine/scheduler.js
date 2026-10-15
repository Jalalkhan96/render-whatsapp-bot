'use strict';
// Sequential scheduler: sources processed ONE BY ONE. One failure never crashes the engine.
const logger = require('./logger');
class Scheduler {
  constructor() { this.queue = []; this.running = false; }
  add(task) { this.queue.push(task); this._pump(); }
  async _pump() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const task = this.queue.shift();
      try { await task(); }
      catch (e) { logger.error('scheduler task failed, continuing', { error: e.message }); }
      // cleanup between sources
      if (global.gc) { try { global.gc(); } catch (_) {} }
    }
    this.running = false;
  }
  // runBulk: sequential with tiny controlled concurrency option (default 1)
  async runBulk(items, fn, { concurrency = 1 } = {}) {
    const results = new Array(items.length);
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        try { results[i] = { ok: true, value: await fn(items[i], i) }; }
        catch (e) { results[i] = { ok: false, error: e.message }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, 3) }, worker));
    return results;
  }
}
module.exports = new Scheduler();
