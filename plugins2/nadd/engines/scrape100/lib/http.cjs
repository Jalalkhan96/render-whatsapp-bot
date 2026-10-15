'use strict';
/* HTTP fetch wrapper: timeout, retries w/ exponential backoff, max response
 * size cap, polite per-host delay, browser UA. Used by core; adapters are
 * self-contained but follow the same policy. (MASTER PROMPT §5, §13, §34) */
const config = require('./config.cjs');
const log = require('./logger.cjs');

const lastHit = new Map(); // host -> timestamp ms

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function politeDelay(url, delayMs) {
  const host = (() => { try { return new URL(url).host; } catch (_) { return url; } })();
  const wait = delayMs != null ? delayMs : config.defaultDelayMs;
  const last = lastHit.get(host) || 0;
  const dt = Date.now() - last;
  if (dt < wait) await sleep(wait - dt);
  lastHit.set(host, Date.now());
}

async function fetchOnce(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || config.requestTimeoutMs;
  const maxBytes = (opts.maxMb || config.maxResponseSizeMb) * 1024 * 1024;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    // Stream with size cap (never hold unlimited RAM).
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch (_) {}
        const err = new Error('response too large');
        err.code = 'TOO_LARGE';
        throw err;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, contentType: ct, text: buf.toString('utf8'), finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

/* GET with retries. Returns {status, contentType, text, finalUrl, attempts}. */
async function get(url, opts = {}) {
  const maxAttempts = opts.retries != null ? opts.retries : config.maxRetries;
  await politeDelay(url, opts.delayMs);
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetchOnce(url, opts);
      return { ...r, attempts: attempt };
    } catch (err) {
      lastErr = err;
      // Don't retry client errors (except 429) or size violations.
      if (err.status && err.status !== 429 && err.status < 500) break;
      if (err.code === 'TOO_LARGE') break;
      if (attempt < maxAttempts) {
        const backoff = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
        log.warn('http.retry', { url: url.slice(0, 80), attempt, backoffMs: backoff, err: err.message });
        await sleep(backoff);
      }
    }
  }
  const e = new Error(`GET failed after ${maxAttempts} attempt(s): ${lastErr && lastErr.message}`);
  e.cause = lastErr;
  e.status = lastErr && lastErr.status;
  throw e;
}

module.exports = { get, politeDelay, sleep };
