'use strict';

/**
 * http.cjs — one honest fetch wrapper: timeout, UA, retries, JSON parsing.
 * Uses global fetch (Node 18+). Always sends an Accept-all header because
 * some CDNs (notably upload/thumb.wikimedia.org) 429 header-less requests.
 */
const config = require('./config.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, { timeoutMs = config.defaultTimeoutMs, retries = config.maxRetries } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': config.userAgent,
          Accept: '*/*',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`non-JSON response (${text.slice(0, 60).replace(/\s+/g, ' ')})`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(config.retryBackoffMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

module.exports = { fetchJson, sleep };
