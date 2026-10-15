'use strict';
// Provider registry: every shortener + resolver with metadata, priority and rate limits.
const fs = require('fs');
const path = require('path');

function loadShorteners() {
  const dir = path.join(__dirname, '..', 'shorteners');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== '_base.js')
    .map((f) => {
      const m = require(path.join(dir, f));
      return {
        id: m.id, name: m.name, domains: m.domains, type: m.type || 'shortener',
        kind: m.kind, homepage: m.homepage, enabled: true,
        transport: m.kind === 'free' ? 'public_api' : m.kind === 'api' ? 'api' : 'redirect',
        rateLimit: { requestsPerMinute: 30, delayMs: 2000 },
        capabilities: { shorten: m.kind !== 'expand_only', expand: true },
      };
    });
}

const resolvers = [
  { id: 'wheregoes', name: 'WhereGoes', type: 'resolver', homepage: 'https://wheregoes.com/', enabled: true, priority: 1, rateLimit: { requestsPerMinute: 20, delayMs: 3000 }, capabilities: { expand: true, trace: true } },
  { id: 'unshortenit', name: 'Unshorten.It', type: 'resolver', homepage: 'https://unshorten.it/', enabled: true, priority: 2, rateLimit: { requestsPerMinute: 20, delayMs: 3000 }, capabilities: { expand: true, safety: true } },
  { id: 'unshortlink', name: 'UnshortLink', type: 'resolver', homepage: 'https://unshortlink.com/', enabled: true, priority: 3, rateLimit: { requestsPerMinute: 20, delayMs: 3000 }, capabilities: { expand: true, trace: true } },
  { id: 'redirectcheck', name: 'RedirectCheck', type: 'resolver', homepage: 'https://www.redirectcheck.org/', enabled: true, priority: 4, rateLimit: { requestsPerMinute: 20, delayMs: 3000 }, capabilities: { expand: true, trace: true } },
  { id: 'generic', name: 'Generic HTTP Resolver', type: 'resolver', homepage: '', enabled: true, priority: 99, rateLimit: { requestsPerMinute: 60, delayMs: 500 }, capabilities: { expand: true, trace: true } },
];

const shorteners = loadShorteners();
// priority: verified no-key free providers first (live-tested order), then other
// free, then key-based (fast AUTH_REQUIRED skip when key missing), then rest.
const FREE_ORDER = ['isgd', 'vgd', 'dagd', 'clckru', 'cleanuri', 'tinyurl'];
const kindRank = { free: 1, scrape: 2, api: 3, webform: 4, selfhosted: 5, expand_only: 6 };
shorteners.forEach((s, i) => {
  const freeIdx = FREE_ORDER.indexOf(s.id);
  s.priority = (kindRank[s.kind] || 3) * 10000 + (freeIdx >= 0 ? freeIdx : 500 + i);
});
const providers = [...shorteners, ...resolvers].sort((a, b) => a.priority - b.priority);

function findByDomain(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return shorteners.find((s) => s.domains.includes(h))
      || shorteners.find((s) => s.domains.some((d) => d && h.endsWith('.' + d)));
}
function getById(id) { return providers.find((p) => p.id === id); }

module.exports = { providers, shorteners, resolvers, findByDomain, getById };
