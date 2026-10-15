'use strict';
/**
 * Wraps a raw adapter object: enforces adapter.rateLimit (delay + per-minute
 * token bucket), per-source timeout override / IMAGE_REQUEST_TIMEOUT, retries
 * (IMAGE_MAX_RETRIES with exponential backoff), and health tracking.
 * Exposes search / getImage / getMetadata / healthCheck with failure isolation
 * (throws after retries; the engine catches so one source never kills a search).
 */
const http = require('./http');
const scrape = require('./scrape');

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class BaseImageSource {
  constructor(adapter, opts = {}) {
    this.adapter = adapter;
    this.env = opts.env || ((k) => process.env[k]);
    this.log = opts.log || (() => {});
    this.health = opts.health || null;
    this._lastCall = 0;
    this._window = [];
  }

  async _rateLimit() {
    const rl = this.adapter.rateLimit || {};
    const now = Date.now();
    if (rl.delayMs) {
      const wait = this._lastCall + rl.delayMs - now;
      if (wait > 0) await sleep(wait);
    }
    if (rl.requestsPerMinute) {
      for (;;) {
        const t = Date.now();
        this._window = this._window.filter((x) => t - x < 60000);
        if (this._window.length < rl.requestsPerMinute) break;
        await sleep(500);
      }
    }
    this._lastCall = Date.now();
    this._window.push(this._lastCall);
  }

  _ctx() { return { http, scrape, env: this.env, log: this.log }; }

  async _run(fn, label) {
    const maxRetries = envInt('IMAGE_MAX_RETRIES', 3);
    const timeout = this.adapter.timeoutMs || envInt('IMAGE_REQUEST_TIMEOUT', 15000);
    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this._rateLimit();
      const t0 = Date.now();
      try {
        const out = await Promise.race([
          fn(this._ctx()),
          new Promise((_, rej) => setTimeout(
            () => rej(new Error(`timeout after ${timeout}ms (${label})`)), timeout)),
        ]);
        if (this.health) {
          this.health.recordSuccess(this.adapter.id, Date.now() - t0, Array.isArray(out) ? out.length : 1);
        }
        return out;
      } catch (e) {
        lastErr = e;
        const msg = String((e && e.message) || e);
        const noRetry = /SSRF|API key missing|not supported|invalid[_ ]?api[_ ]?key/i.test(msg);
        const retryable = !noRetry && /timeout|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed|socket|429|50\d/i.test(msg);
        if (attempt < maxRetries && retryable) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        break;
      }
    }
    if (this.health) this.health.recordFailure(this.adapter.id, lastErr);
    throw lastErr;
  }

  async search(query, options = {}) {
    const raws = await this._run((ctx) => this.adapter.search(query, options, ctx), 'search');
    return Array.isArray(raws) ? raws : [];
  }

  async getImage(id, options = {}) {
    if (typeof this.adapter.getImage !== 'function') {
      throw new Error(`${this.adapter.id}: getImage not supported`);
    }
    return this._run((ctx) => this.adapter.getImage(id, options, ctx), 'getImage');
  }

  async getMetadata(id, options = {}) {
    if (typeof this.adapter.getMetadata === 'function') {
      return this._run((ctx) => this.adapter.getMetadata(id, options, ctx), 'getMetadata');
    }
    return this.getImage(id, options);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const raws = await this.search('nature', { limit: 1 });
      return { id: this.adapter.id, ok: true, results: raws.length, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { id: this.adapter.id, ok: false, error: String((e && e.message) || e), latencyMs: Date.now() - t0 };
    }
  }
}

module.exports = { BaseImageSource };
