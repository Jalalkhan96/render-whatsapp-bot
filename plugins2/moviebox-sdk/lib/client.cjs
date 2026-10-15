'use strict';
/**
 * MovieBox+ API client — zero dependencies, Node 18+ (native fetch).
 *
 * Reverse-engineered from MovieBox+ v4.0.02.0903.02 (com.community.oneroom).
 * The app builds request URLs at runtime as:  BASE_URL + ENDPOINT_PATH
 * and talks JSON over HTTPS with OkHttp. This client mirrors that contract.
 *
 * NOTE on auth/signing: the APK ships assets/hisavana_rsa_public_key.pem and
 * uses `sign`/`appKey` style parameters plus an `X-Gslb-Sign` header for GSLB.
 * The exact per-endpoint signing scheme is computed at runtime inside the
 * obfuscated app code and was NOT fully recovered statically — most public
 * (consumer-not-login) endpoints work without it; authenticated endpoints
 * need a login token (see user.login / user.thirdLogin).
 */
const { HOSTS } = require('./config.cjs');

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'okhttp/4.12.0', // app uses OkHttp
};

class MovieBoxClient {
  /**
   * @param {object} [opts]
   * @param {'prod'|'prodAlt'|'test'|string} [opts.env='prod'] - 'prod' (i-api.aoneroom.com),
   *   'prodAlt' (api.inmoviebox.com), 'test' (i-api-test.aoneroom.com), or a full base URL string.
   * @param {string} [opts.token] - auth token (from user.login) sent as `token` header.
   * @param {object} [opts.headers] - extra headers merged into every request.
   * @param {number} [opts.timeoutMs=15000]
   * @param {string[]} [opts.failover] - extra base URLs to try on network failure.
   */
  constructor(opts = {}) {
    const env = opts.env || 'prod';
    this.baseUrl = typeof env === 'string' && env.startsWith('http')
      ? env
      : (HOSTS[env] || HOSTS.prod);
    this.token = opts.token || null;
    this.extraHeaders = opts.headers || {};
    this.timeoutMs = opts.timeoutMs || 15000;
    this.failover = opts.failover || [];
  }

  setToken(token) { this.token = token; return this; }

  headers() {
    const h = { ...DEFAULT_HEADERS, ...this.extraHeaders };
    if (this.token) h['token'] = this.token;
    return h;
  }

  /**
   * Raw request against any endpoint path.
   * @param {'GET'|'POST'|'PUT'|'DELETE'} method
   * @param {string} path - e.g. '/wefeed-mobile-bff/subject-api/search'
   * @param {object} [opts] - { query, body, headers, baseUrl }
   */
  async request(method, path, opts = {}) {
    const bases = [opts.baseUrl || this.baseUrl, ...this.failover];
    let lastErr;
    for (const base of bases) {
      const url = new URL(base.replace(/\/$/, '') + path);
      if (opts.query) {
        for (const [k, v] of Object.entries(opts.query)) {
          if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        }
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(url.toString(), {
          method,
          headers: { ...this.headers(), ...(opts.headers || {}) },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} ${method} ${path}`);
          err.status = res.status; err.data = data; err.path = path;
          throw err;
        }
        return data;
      } catch (e) {
        lastErr = e;
        if (e.status) throw e; // HTTP error from server: don't fail over
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr;
  }

  get(path, opts) { return this.request('GET', path, opts); }
  post(path, body, opts = {}) { return this.request('POST', path, { ...opts, body }); }
  put(path, body, opts = {}) { return this.request('PUT', path, { ...opts, body }); }
  del(path, opts) { return this.request('DELETE', path, opts); }
}

module.exports = { MovieBoxClient, HOSTS };
