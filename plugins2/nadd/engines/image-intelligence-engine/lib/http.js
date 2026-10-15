'use strict';
/**
 * HTTP transport: timeout, retries w/ exponential backoff, max 5 redirects,
 * response byte cap, SSRF protection (DNS resolve + private-range reject on
 * EVERY hop), custom User-Agent. Zero dependencies, uses global fetch (Node 18+).
 */
const dns = require('dns').promises;

const USER_AGENT = 'ImageIntelligenceEngine/1.0 (compatible; image search bot)';

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- IP helpers ----------
function isIPv4Literal(s) { return /^(\d{1,3}\.){3}\d{1,3}$/.test(s); }
function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
}
function inCidr(ipInt, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((b & mask) >>> 0);
}
// IPv4 ranges that must never be fetched (RFC 1918, loopback, link-local,
// carrier-grade NAT, documentation, multicast, reserved).
const IPV4_BLOCKED = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.2.0/24', '192.168.0.0/16', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

function isPrivateIp(ip) {
  if (ip === undefined || ip === null) return true;
  let s = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (s.includes(':')) {
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7)); // IPv4-mapped
    const first = s.split(':')[0];
    if (/^(fc|fd)/.test(first)) return true;   // fc00::/7 unique-local
    if (/^fe[89ab]/.test(first)) return true;  // fe80::/10 link-local
    return false;
  }
  if (!isIPv4Literal(s)) return true; // unknown format -> block (fail closed)
  const n = ipv4ToInt(s);
  if (n === null) return true;
  return IPV4_BLOCKED.some((c) => inCidr(n, c));
}

async function assertPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new Error('SSRF: empty hostname');
  if (host === 'localhost') throw new Error('SSRF: localhost blocked');
  if (isIPv4Literal(host)) {
    if (isPrivateIp(host)) throw new Error(`SSRF: blocked IP literal ${host}`);
    return;
  }
  let v4 = [], v6 = [];
  try { v4 = await dns.resolve4(host); } catch (_) { /* ignore */ }
  try { v6 = await dns.resolve6(host); } catch (_) { /* ignore */ }
  const all = [...v4, ...v6];
  if (!all.length) throw new Error(`SSRF: DNS resolution failed for ${host}`);
  for (const ip of all) {
    if (isPrivateIp(ip)) throw new Error(`SSRF: ${host} resolves to blocked IP ${ip}`);
  }
}

async function readBodyCapped(res, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`Response exceeded byte cap (${maxBytes} bytes)`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function requestOnce(url, opts) {
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`SSRF: unsupported protocol ${u.protocol}`);
  }
  await assertPublicHost(u.hostname); // re-checked on every redirect hop
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new Error(`Request timeout after ${opts.timeout}ms`)),
    opts.timeout
  );
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', ...(opts.headers || {}) },
      body: opts.body,
      signal: ctrl.signal,
      redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      try { res.body && res.body.cancel && res.body.cancel(); } catch (_) { /* ignore */ }
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect ${res.status} without Location header`);
      return { redirect: new URL(loc, url).toString(), status: res.status };
    }
    const body = await readBodyCapped(res, opts.maxBytes);
    const headers = {};
    res.headers.forEach((v, k) => { headers[String(k).toLowerCase()] = v; });
    return {
      status: res.status, headers, body, url,
      text: () => body.toString('utf8'),
      json: () => JSON.parse(body.toString('utf8')),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function request(url, opts = {}) {
  const timeout = opts.timeout || envInt('IMAGE_REQUEST_TIMEOUT', 15000);
  const maxRetries = opts.retries !== undefined ? opts.retries : envInt('IMAGE_MAX_RETRIES', 3);
  const maxRedirects = opts.maxRedirects || 5;
  const maxBytes = opts.maxBytes || 8 * 1024 * 1024;
  let current = url, redirects = 0, attempt = 0;
  for (;;) {
    try {
      const r = await requestOnce(current, { ...opts, timeout, maxBytes });
      if (r.redirect) {
        if (++redirects > maxRedirects) throw new Error('Too many redirects');
        current = r.redirect;
        continue;
      }
      if (r.status >= 500 && attempt < maxRetries) {
        attempt++;
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      return r;
    } catch (e) {
      const msg = String((e && e.message) || e);
      const byteCap = /exceeded byte cap/i.test(msg);
      const retryable = !byteCap && /timeout|abort|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket|fetch failed|429/i.test(msg);
      if (attempt < maxRetries && retryable) {
        attempt++;
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw e;
    }
  }
}

module.exports = {
  request,
  get: (url, opts) => request(url, { ...(opts || {}), method: 'GET' }),
  post: (url, body, opts) => request(url, { ...(opts || {}), method: 'POST', body }),
  isPrivateIp,
  assertPublicHost,
  USER_AGENT,
};
