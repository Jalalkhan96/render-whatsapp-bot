'use strict';
// traceRedirects(url, options): follows HTTP 301/302/303/307/308, meta refresh,
// and public JS redirects. SSRF-checked at every hop. HEAD first, GET fallback.
const http = require('http');
const https = require('https');
const { assertPublicTarget } = require('./security/ssrf');
const logger = require('./logger');

const UA = 'MyApp-LinkResolver/1.0 (+link-intelligence-engine)';
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function rawRequest(urlStr, { method, timeout, maxBytes }) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return resolve({ error: 'malformed', detail: e.message }); }
    const lib = url.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };
    if (method === 'GET') headers['Range'] = 'bytes=0-65535';
    const req = lib.request(url, { method, headers, timeout }, (res) => {
      const chunks = [];
      let bytes = 0;
      let aborted = false;
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes > maxBytes) { aborted = true; res.destroy(); }
        else chunks.push(c);
      });
      res.on('end', () => resolve({
        statusCode: res.statusCode, headers: res.headers,
        body: aborted ? Buffer.concat(chunks).toString('utf8').slice(0, 65536) : Buffer.concat(chunks).toString('utf8'),
        truncated: aborted, responseTimeMs: Date.now() - t0,
      }));
      res.on('error', (e) => resolve({ error: 'response_error', detail: e.message, responseTimeMs: Date.now() - t0 }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({
      error: e.message === 'timeout' ? 'TIMEOUT' : 'request_error',
      detail: e.message, responseTimeMs: Date.now() - t0,
    }));
    req.end();
  });
}

function findMetaRefresh(html, base) {
  if (!html) return null;
  const m = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']([^"']+)["']/i)
         || html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*http-equiv\s*=\s*["']?refresh["']?/i);
  if (!m) return null;
  const parts = m[1].split(';');
  for (const p of parts) {
    const u = p.trim().match(/^url\s*=\s*(.+)$/i);
    if (u) {
      try { return new URL(u[1].replace(/^['"]|['"]$/g, ''), base).toString(); } catch (_) { return null; }
    }
  }
  return null; // refresh with no URL = page reload, not a redirect
}

function findJsRedirect(html, base) {
  if (!html) return null;
  const patterns = [
    /window\.location\s*=\s*["']([^"']+)["']/i,
    /window\.location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
    /window\.location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
  ];
  // Only treat as redirect if it looks like an immediate top-level redirect
  // (avoid matching JS strings inside page content). Require it early in body.
  const head = html.slice(0, 8192);
  for (const re of patterns) {
    const m = head.match(re);
    if (m) {
      try { return new URL(m[1], base).toString(); } catch (_) { /* continue */ }
    }
  }
  return null;
}

function looksLikeGate(html, headers) {
  const ct = (headers['content-type'] || '').toLowerCase();
  const h = (html || '').toLowerCase();
  const signals = ['captcha', 'cloudflare', 'cf-challenge', 'just a moment', 'verify you are human',
    'are you a robot', 'please wait', 'countdown', 'continue to proceed', 'linkvertise', 'ouo.io'];
  if (/text\/html/.test(ct) && signals.some((s) => h.includes(s))) return true;
  return false;
}

// Click-through interstitials (e.g. da.gd fresh-link anti-phishing screen):
// the destination is ADVERTISED in the HTML but requires a human click.
// We surface the advertised URL for intelligence but never auto-click through.
function findInterstitialDestination(html, current) {
  if (!html) return null;
  const patterns = [
    /created recently/i,
    /explicit click-through/i,
    /require.*click.*before.*redirect/i,
    /click to continue to your link/i,
  ];
  if (!patterns.some((re) => re.test(html))) return null;
  let currentHost = '';
  try { currentHost = new URL(current).hostname.toLowerCase(); } catch (_) {}
  // Prefer the href right after "redirecting you to the following URL"
  let m = html.match(/redirecting you to the following URL:?\s*<\/p>\s*<a[^>]+href=["'](https?:\/\/[^"']+)["']/i)
       || html.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*<pre[^>]*class=["'][^"']*interstitial/i);
  if (m) { try { return new URL(m[1], current).toString(); } catch (_) {} }
  // Generic fallback: first absolute href to a DIFFERENT host
  for (const mm of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) {
    try {
      const u = new URL(mm[1]);
      if (u.hostname.toLowerCase() !== currentHost) return u.toString();
    } catch (_) {}
  }
  return null;
}

async function traceRedirects(inputUrl, options = {}) {
  const maxHops = options.maxHops || parseInt(process.env.MAX_REDIRECT_HOPS || '20', 10);
  const timeout = options.timeout || parseInt(process.env.LINK_REQUEST_TIMEOUT || '15000', 10);
  const maxBytes = (options.maxMb || parseFloat(process.env.MAX_LINK_RESPONSE_MB || '2')) * 1024 * 1024;
  const hops = [];
  const seen = new Set();
  let current = inputUrl;

  for (let i = 0; i < maxHops; i++) {
    if (seen.has(current)) {
      return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'REDIRECT_LOOP' };
    }
    seen.add(current);

    // SSRF gate at every hop. allowPrivate is TEST-ONLY (local loopback servers in tests/run.js).
    if (!options.allowPrivate) {
      const ssrf = await assertPublicTarget(current);
      if (!ssrf.ok) {
        const status = ssrf.reason === 'dns_failure' ? 'DNS_FAILURE' : 'SSRF_BLOCKED';
        logger.error('hop blocked', { url: (() => { try { return new URL(current).hostname; } catch (_) { return '?'; } })(), status });
        return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status, reason: ssrf.reason };
      }
    }

    let res = await rawRequest(current, { method: 'HEAD', timeout, maxBytes: 0 });
    let via = 'HEAD';
    // Fall back to GET when HEAD is unsupported or uninformative
    if (res.error || (res.statusCode === 405) || (!REDIRECT_CODES.has(res.statusCode) && res.statusCode >= 400 && res.statusCode !== 404)) {
      res = await rawRequest(current, { method: 'GET', timeout, maxBytes });
      via = 'GET';
    } else if (!REDIRECT_CODES.has(res.statusCode)) {
      // HEAD gave a final-ish status; still do a light GET for meta/JS redirect detection
      const g = await rawRequest(current, { method: 'GET', timeout, maxBytes });
      if (!g.error) { res = g; via = 'GET'; }
    }

    if (res.error === 'TIMEOUT' || res.error === 'timeout') {
      return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'TIMEOUT' };
    }
    if (res.error) {
      return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'ERROR', reason: res.error, detail: res.detail };
    }

    const u = new URL(current);
    const hop = {
      url: current, statusCode: res.statusCode,
      location: res.headers.location || null,
      hostname: u.hostname, https: u.protocol === 'https:',
      responseTimeMs: res.responseTimeMs, via,
    };

    // 1) HTTP redirect
    if (REDIRECT_CODES.has(res.statusCode) && res.headers.location) {
      hop.type = 'server_redirect';
      let next;
      try { next = new URL(res.headers.location, current).toString(); }
      catch (_) { hops.push(hop); return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'ERROR', reason: 'bad_location' }; }
      hops.push(hop);
      logger.info('hop', { n: hops.length, status: res.statusCode, host: u.hostname });
      current = next;
      continue;
    }

    // 2) Meta refresh (public)
    const meta = findMetaRefresh(res.body, current);
    if (meta) {
      hop.type = 'meta_redirect'; hop.location = meta; hops.push(hop);
      current = meta; continue;
    }
    // 3) Public JS redirect
    const js = findJsRedirect(res.body, current);
    if (js) {
      hop.type = 'javascript_redirect'; hop.location = js; hops.push(hop);
      current = js; continue;
    }
    // 4) Click-through interstitial (human confirmation required) -> STOP, surface advertised URL
    const inter = findInterstitialDestination(res.body, current);
    if (inter) {
      hop.type = 'interaction_interstitial'; hop.advertisedDestination = inter; hops.push(hop);
      logger.info('interstitial gate', { host: u.hostname });
      return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length - 1, status: 'INTERACTION_REQUIRED', reason: 'click_through_interstitial', advertisedDestination: inter };
    }
    // 5) Monetized / interaction gate -> STOP, never bypass
    if (looksLikeGate(res.body, res.headers)) {
      hop.type = 'interaction_gate'; hops.push(hop);
      return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'INTERACTION_REQUIRED', reason: 'monetized_shortlink_or_challenge' };
    }

    // Final destination reached
    hop.type = hop.type || 'final';
    hops.push(hop);
    return {
      input: inputUrl, hops, finalUrl: current, hopCount: hops.length - 1,
      status: res.statusCode >= 400 ? 'HTTP_ERROR' : 'resolved',
      finalStatus: res.statusCode, contentType: res.headers['content-type'] || null,
      contentLength: res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : null,
    };
  }
  return { input: inputUrl, hops, finalUrl: current, hopCount: hops.length, status: 'REDIRECT_LIMIT' };
}

module.exports = { traceRedirects, REDIRECT_CODES };
