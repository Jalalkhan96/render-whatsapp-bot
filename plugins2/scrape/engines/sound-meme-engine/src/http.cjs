'use strict';

// Same honest fetch wrapper as the meme engine: timeout, UA, retries.
const config = require('./config.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { timeoutMs = config.defaultTimeoutMs, retries = config.maxRetries } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': config.userAgent,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: '*/*',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(config.retryBackoffMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response (${text.slice(0, 60).replace(/\s+/g, ' ')})`);
  }
}

module.exports = { fetchText, fetchJson, sleep };
