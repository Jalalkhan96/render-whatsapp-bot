'use strict';
/* Minimal zero-dependency HTTP client for the licensed adult finder.
 * GET only. 20s timeout, 3 retries with backoff, 429 handling,
 * per-host minimum interval (politeness for official APIs). */

const http = require('http');
const https = require('https');

const UA = 'licensed-adult-finder/1.0 (+official-api-client)';
const TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const lastHit = new Map(); // host -> timestamp ms

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function requestOnce(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
      timeout: TIMEOUT_MS,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/** GET and parse JSON. Returns { ok, data } or { ok:false, error }. */
async function getJson(urlStr, minIntervalMs = 1200) {
  const host = new URL(urlStr).hostname;
  const since = Date.now() - (lastHit.get(host) || 0);
  if (since < minIntervalMs) await sleep(minIntervalMs - since);

  let attempt = 0;
  let wait = 1000;
  while (true) {
    attempt++;
    try {
      const res = await requestOnce(urlStr);
      lastHit.set(host, Date.now());
      if (res.status === 429) {
        if (attempt > MAX_RETRIES) return { ok: false, error: 'rate-limited (429) after retries' };
        const retryAfter = parseInt(res.headers['retry-after'] || '0', 10);
        await sleep((retryAfter > 0 ? retryAfter * 1000 : wait));
        wait *= 2;
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, error: 'http ' + res.status };
      }
      return { ok: true, data: JSON.parse(res.body) };
    } catch (e) {
      if (attempt >= MAX_RETRIES) return { ok: false, error: String(e.message || e) };
      await sleep(wait);
      wait *= 2;
    }
  }
}

module.exports = { getJson, UA };
