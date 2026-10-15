'use strict';
// Resolver adapters: third-party redirect-check services.
// Each verifies its own availability via health() — never hard-coded active.
// Fallback order is handled by resolver-engine.js (primary -> fallback -> generic).
const { get } = require('../shorteners/_base');
const { traceRedirects } = require('../redirect-engine');

function pageResolver(id, name, homepage, extract) {
  return {
    id, name, homepage, type: 'resolver',
    async expand(url) {
      // These services are HTML pages; we attempt a light fetch and extract
      // the destination with a tolerant regex. Availability is checked first.
      const h = await this.health();
      if (h !== 'healthy') return { ok: false, status: 'PROVIDER_UNAVAILABLE', provider: id };
      try {
        const r = await get(homepage);
        if (!r.text && r.status !== 200) return { ok: false, status: 'PROVIDER_ERROR', provider: id };
        const dest = extract ? extract(r.text, url) : null;
        if (dest) return { ok: true, status: 'resolved', provider: id, finalUrl: dest };
        return { ok: false, status: 'PROVIDER_NO_RESULT', provider: id };
      } catch (e) {
        return { ok: false, status: 'ERROR', provider: id, detail: e.message };
      }
    },
    async health() {
      try {
        const { ping } = require('../health-manager');
        const r = await ping(homepage, 8000);
        return r.ok ? 'healthy' : 'degraded';
      } catch (_) { return 'unknown'; }
    },
  };
}

const wheregoes = pageResolver('wheregoes', 'WhereGoes', 'https://wheregoes.com/');
const unshortenit = pageResolver('unshortenit', 'Unshorten.It', 'https://unshorten.it/');
const unshortlink = pageResolver('unshortlink', 'UnshortLink', 'https://unshortlink.com/');
const redirectcheck = pageResolver('redirectcheck', 'RedirectCheck', 'https://www.redirectcheck.org/');

// Generic resolver: direct HTTP redirect tracing (always available, no third party).
const generic = {
  id: 'generic', name: 'Generic HTTP Resolver', type: 'resolver',
  async expand(url, opts) {
    const t = await traceRedirects(url, opts);
    return { ok: t.status === 'resolved', status: t.status, provider: 'generic', finalUrl: t.finalUrl, trace: t };
  },
  async health() { return 'healthy'; },
};

module.exports = { wheregoes, unshortenit, unshortlink, redirectcheck, generic };
