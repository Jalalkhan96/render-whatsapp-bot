/*
 * core/http.cjs — resilient fetch wrapper for the Open Knowledge Engine.
 *
 * - Default 20s timeout (KNOWLEDGE_REQUEST_TIMEOUT env override, ms)
 * - 3 retries with exponential backoff (KNOWLEDGE_MAX_RETRIES env override)
 * - Identification: User-Agent 'OpenKnowledgeEngine/1.0' + contact email
 *   from OPENKNOWLEDGE_CONTACT env (Open Library / Nominatim require this).
 * - Per-source rate limiting via SourceRateLimiter (requestsPerMinute/delayMs)
 * - Graceful 429 backoff (honour Retry-After when present)
 * - Never throws raw huge bodies into logs: errors carry truncated summaries.
 */
'use strict';

const CONTACT = process.env.OPENKNOWLEDGE_CONTACT || 'contact@example.org';
const USER_AGENT = `OpenKnowledgeEngine/1.0 (${CONTACT})`;

function getTimeoutMs(overrides) {
  const v = overrides && overrides.timeoutMs != null ? overrides.timeoutMs
    : (process.env.KNOWLEDGE_REQUEST_TIMEOUT ? Number(process.env.KNOWLEDGE_REQUEST_TIMEOUT) : 20000);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 20000;
}

function getMaxRetries(overrides) {
  const v = overrides && overrides.maxRetries != null ? overrides.maxRetries
    : (process.env.KNOWLEDGE_MAX_RETRIES ? Number(process.env.KNOWLEDGE_MAX_RETRIES) : 3);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 3;
}

function truncate(str, max = 400) {
  if (str == null) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + '…[truncated]' : s;
}

class KnowledgeHttpError extends Error {
  constructor(message, info) {
    super(message);
    this.name = 'KnowledgeHttpError';
    this.info = info || {};
  }
}

class SourceRateLimiter {
  constructor(cfg) {
    cfg = cfg || {};
    this.minDelayMs = cfg.delayMs != null ? cfg.delayMs : 0;
    if (cfg.requestsPerMinute && cfg.requestsPerMinute > 0) {
      this.minDelayMs = Math.max(this.minDelayMs, Math.ceil(60000 / cfg.requestsPerMinute));
    }
    this._lastTs = 0;
    this._chain = Promise.resolve();
  }
  async acquire() {
    const run = this._chain.then(async () => {
      const now = Date.now();
      const wait = this._lastTs + this.minDelayMs - now;
      if (wait > 0) await sleep(wait);
      this._lastTs = Date.now();
    });
    this._chain = run.catch(() => {});
    return run;
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function backoffDelay(attempt) {
  // exponential: 1s, 2s, 4s ... + small jitter
  return Math.min(1000 * Math.pow(2, attempt), 15000) + Math.floor(Math.random() * 250);
}

async function fetchOnce(url, opts) {
  const timeoutMs = getTimeoutMs(opts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = Object.assign({ 'User-Agent': USER_AGENT, 'Accept': 'application/json, */*' }, opts.headers || {});
  let res;
  try {
    res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, signal: controller.signal, redirect: 'follow' });
  } catch (err) {
    clearTimeout(timer);
    throw new KnowledgeHttpError(`network error: ${err && err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (err && err.message) || String(err)}`, { url, kind: 'network', timeoutMs });
  }
  clearTimeout(timer);

  if (res.status === 429 || res.status === 503) {
    const retryAfter = res.headers.get('retry-after');
    throw new KnowledgeHttpError(`rate limited (HTTP ${res.status})`, { url, kind: 'rate_limited', status: res.status, retryAfter: retryAfter ? Number(retryAfter) || null : null });
  }
  if (!res.ok) {
    throw new KnowledgeHttpError(`HTTP ${res.status} ${res.statusText || ''}`.trim(), { url, kind: 'http_error', status: res.status });
  }
  return res;
}

async function request(url, opts) {
  opts = opts || {};
  const maxRetries = getMaxRetries(opts);
  const limiter = opts.limiter instanceof SourceRateLimiter ? opts.limiter : null;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      if (limiter) await limiter.acquire();
      return await fetchOnce(url, opts);
    } catch (err) {
      const retriable = err instanceof KnowledgeHttpError &&
        (err.info.kind === 'network' || err.info.kind === 'rate_limited' || err.info.status >= 500);
      if (retriable && attempt < maxRetries) {
        let wait = backoffDelay(attempt);
        if (err.info.retryAfter != null) wait = Math.max(wait, Math.min(err.info.retryAfter * 1000, 60000));
        attempt += 1;
        await sleep(wait);
        continue;
      }
      // Surface a compact error; never the raw body.
      const info = err.info ? Object.assign({}, err.info, { url: truncate(err.info.url, 200) }) : {};
      throw new KnowledgeHttpError(err.message, info);
    }
  }
}

async function readBodySafely(res, maxBytes = 10 * 1024 * 1024) {
  // Memory protection: cap body size before parsing.
  const reader = res.body ? res.body.getReader() : null;
  if (!reader) {
    const t = await res.text();
    return t.slice(0, maxBytes);
  }
  const chunks = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total + value.length));
      total = maxBytes;
      break;
    }
    chunks.push(value);
    if (total >= maxBytes) break;
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString('utf8');
}

async function getJson(url, opts) {
  const res = await request(url, opts);
  const text = await readBodySafely(res, (opts && opts.maxBytes) || 8 * 1024 * 1024);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new KnowledgeHttpError('invalid JSON response', { url, kind: 'parse_error', bodyPreview: truncate(text, 300) });
  }
}

async function getText(url, opts) {
  const res = await request(url, opts);
  return readBodySafely(res, (opts && opts.maxBytes) || 4 * 1024 * 1024);
}

module.exports = {
  request,
  getJson,
  getText,
  SourceRateLimiter,
  KnowledgeHttpError,
  USER_AGENT,
  sleep,
};
