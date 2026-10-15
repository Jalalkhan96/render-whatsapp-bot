'use strict';
/**
 * Shared HTTP layer for the music engine.
 * - Timeout, retries with exponential backoff, single-flight browser-less fetches.
 * - Every response body is consumed and released; nothing is kept in memory
 *   beyond the returned string/object. Callers must not hold on to raw HTML.
 */

const DEFAULT_TIMEOUT = parseInt(process.env.MUSIC_TIMEOUT || '30000', 10);
const MAX_RETRIES = parseInt(process.env.MUSIC_MAX_RETRIES || '3', 10);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Low-level fetch, one attempt. Always consumes the body.
 * Returns { ok, status, text, finalUrl, ms, error }
 */
async function fetchOnce(url, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  const headers = Object.assign(
    {
      'User-Agent': opts.userAgent || pickUA(),
      Accept: opts.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    opts.headers || {}
  );
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const text = await res.text(); // consume fully, then release
    return { ok: res.ok, status: res.status, text, finalUrl: res.url, ms: Date.now() - started, error: null };
  } catch (err) {
    const isTimeout = err && (err.name === 'AbortError' || /abort/i.test(String(err.message)));
    return { ok: false, status: 0, text: '', finalUrl: url, ms: Date.now() - started, error: isTimeout ? 'timeout' : String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch text with retries + exponential backoff.
 * Never retries endlessly: at most `retries` attempts (default MUSIC_MAX_RETRIES).
 */
async function fetchText(url, opts = {}) {
  const retries = opts.retries != null ? opts.retries : MAX_RETRIES;
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetchOnce(url, opts);
    last = r;
    if (r.ok) return r;
    // Retry on network errors, timeouts and 5xx / 429. Never retry 4xx (except 429).
    const retryable = r.status === 0 || r.status === 429 || (r.status >= 500 && r.status < 600);
    if (!retryable || attempt === retries) break;
    await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
  }
  return last;
}

/**
 * Fetch + JSON.parse. Returns { ok, status, data, finalUrl, ms, error }.
 * data is null when the body is not valid JSON.
 */
async function fetchJson(url, opts = {}) {
  const r = await fetchText(url, Object.assign({}, opts, { accept: 'application/json, text/plain, */*' }));
  if (!r.ok) return { ok: false, status: r.status, data: null, finalUrl: r.finalUrl, ms: r.ms, error: r.error || ('http_' + r.status) };
  try {
    const data = JSON.parse(r.text);
    return { ok: true, status: r.status, data, finalUrl: r.finalUrl, ms: r.ms, error: null };
  } catch (e) {
    return { ok: false, status: r.status, data: null, finalUrl: r.finalUrl, ms: r.ms, error: 'invalid_json' };
  }
}

module.exports = { fetchText, fetchJson, fetchOnce, sleep, pickUA, DEFAULT_TIMEOUT, MAX_RETRIES };
