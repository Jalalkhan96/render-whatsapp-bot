'use strict';
// Shared HTTP helper for shortener adapters (transparent UA, timeouts, size cap).
const http = require('http'); const https = require('https');
const UA = 'MyApp-LinkResolver/1.0 (+link-intelligence-engine)';
function raw(url, opts, body) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, timeout: 15000 }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n < 131072) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', text: '' }); });
    req.on('error', (e) => resolve({ status: 'ERROR', text: e.message }));
    if (body) req.write(body);
    req.end();
  });
}
async function get(url, pick) {
  const r = await raw(url, {});
  if (typeof r.status !== 'number' || r.status >= 400) return { ok: false, status: r.status };
  if (pick) { const v = pick(r.text.trim()); return v ? { ok: true, ...v } : { ok: false, status: 'API_ERROR', detail: r.text.slice(0, 160) }; }
  return r.text.startsWith('http') ? { ok: true, shortUrl: r.text.trim() } : { ok: false, status: 'API_ERROR', detail: r.text.slice(0, 160) };
}
async function post(url, data, headers, pick) {
  const body = JSON.stringify(data);
  const r = await raw(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, body);
  if (r.status === 'TIMEOUT' || r.status === 'ERROR') return { ok: false, status: r.status, detail: r.text };
  if (r.status === 401 || r.status === 403) return { ok: false, status: 'AUTH_REQUIRED' };
  if (r.status >= 400) return { ok: false, status: 'API_ERROR', detail: r.text.slice(0, 160) };
  let j; try { j = JSON.parse(r.text); } catch (e) { return { ok: false, status: 'API_ERROR', detail: 'bad json' }; }
  const v = pick(j);
  return v ? { ok: true, ...v } : { ok: false, status: 'API_ERROR', detail: r.text.slice(0, 160) };
}
module.exports = { get, post, UA };