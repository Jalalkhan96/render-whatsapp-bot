/*
 * core/base-source.cjs — base class every source adapter extends.
 *
 * Adapter contract (§76):
 *   class XxxSource extends BaseKnowledgeSource {
 *     async search(query, options) {}   // REQUIRED — normalized universal results
 *     async getItem(id, options) {}
 *     async getMetadata(id, options) {}
 *     async getRelated(id, options) {}
 *     async healthCheck() {}            // REQUIRED — returns status object
 *   }
 *
 * §75 NO FABRICATION: helpers normalise missing data to null / 'unknown' /
 * 'not_available'. Adapters must NEVER invent authors, dates, licenses, URLs,
 * coordinates or statistics. When a stub has no implementation, it returns
 * [] and a declared status — never fabricated results.
 */
'use strict';

const { getJson, getText, SourceRateLimiter, KnowledgeHttpError } = require('./http.cjs');

const MISSING_STRING = 'unknown';
const MISSING_VALUE = null;

function noValue(v, fallback) {
  // Compact missing-value helper (§75).
  if (v === undefined || v === null) return fallback === undefined ? MISSING_VALUE : fallback;
  if (typeof v === 'string' && v.trim() === '') return fallback === undefined ? MISSING_VALUE : fallback;
  return v;
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) return v;
  }
  return null;
}

const LICENSE_HINTS = [
  // [match regex, canonical license string]
  [/^public domain$/i, 'public-domain'],
  [/public domain/i, 'public-domain'],
  [/^cc0/i, 'CC0-1.0'],
  [/cc-by-sa\/4/i, 'CC-BY-SA-4.0'],
  [/cc-by-sa/i, 'CC-BY-SA-4.0'],
  [/cc-by-nc-sa/i, 'CC-BY-NC-SA-4.0'],
  [/cc-by-nc/i, 'CC-BY-NC-4.0'],
  [/cc-by\/4/i, 'CC-BY-4.0'],
  [/cc-by/i, 'CC-BY-4.0'],
  [/cc-by-nd/i, 'CC-BY-ND-4.0'],
  [/mit license/i, 'MIT'],
  [/apache[-\s]?2/i, 'Apache-2.0'],
  [/gpl[-\s]?3/i, 'GPL-3.0'],
  [/odbl/i, 'ODbL-1.0'],
  [/all rights reserved/i, 'all-rights-reserved'],
  [/copyrighted|\(c\)/i, 'copyrighted'],
  [/open access/i, 'open-access'],
];

function classifyLicense(raw) {
  // §96 / §38: NEVER map 'unknown' -> 'free'. Unrecognised or missing stays 'unknown'.
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return 'unknown';
  const s = String(raw).trim();
  if (/^unknown$/i.test(s) || /^not_available$/i.test(s)) return 'unknown';
  for (const [re, canon] of LICENSE_HINTS) {
    if (re.test(s)) return canon;
  }
  return s.length <= 80 ? s : 'unknown';
}

function universalResult(partial) {
  // §7 UNIVERSAL RESULT FORMAT — every adapter funnels through this.
  partial = partial || {};
  const r = {
    id: noValue(partial.id, null),
    source: noValue(partial.source, 'unknown'),
    sourceId: noValue(partial.sourceId, null),
    sourceUrl: noValue(partial.sourceUrl, null),
    title: noValue(partial.title, null),
    description: noValue(partial.description, null),
    type: noValue(partial.type, 'unknown'),
    creator: noValue(partial.creator, null),
    date: noValue(partial.date, null),
    updatedAt: noValue(partial.updatedAt, null),
    language: noValue(partial.language, null),
    country: noValue(partial.country, null),
    contentUrl: noValue(partial.contentUrl, null),
    thumbnailUrl: noValue(partial.thumbnailUrl, null),
    license: classifyLicense(partial.license),
    licenseUrl: noValue(partial.licenseUrl, null),
    rights: noValue(partial.rights, 'unknown'),
    identifiers: partial.identifiers && typeof partial.identifiers === 'object' ? partial.identifiers : {},
    tags: Array.isArray(partial.tags) ? partial.tags.filter((t) => typeof t === 'string') : [],
    categories: Array.isArray(partial.categories) ? partial.categories.filter((t) => typeof t === 'string') : [],
    coordinates: {
      lat: partial.coordinates && partial.coordinates.lat != null && Number.isFinite(Number(partial.coordinates.lat)) ? Number(partial.coordinates.lat) : null,
      lon: partial.coordinates && partial.coordinates.lon != null && Number.isFinite(Number(partial.coordinates.lon)) ? Number(partial.coordinates.lon) : null,
    },
    metadata: partial.metadata && typeof partial.metadata === 'object' ? partial.metadata : {},
    retrievedAt: new Date().toISOString(),
  };
  return r;
}

class BaseKnowledgeSource {
  constructor(deps, meta) {
    this.deps = deps || {};
    this.meta = meta || {};
    this.limiter = new SourceRateLimiter(this.meta.rateLimit || {});
    this._healthySince = null;
  }

  get id() { return this.meta.id || 'unknown-source'; }
  get name() { return this.meta.name || this.id; }
  get category() { return this.meta.category || 'misc'; }

  _buildUrl(base, params) {
    if (!params || typeof params !== 'object') return base;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      qs.append(k, String(v));
    }
    const q = qs.toString();
    if (!q) return base;
    return base + (base.includes('?') ? '&' : '?') + q;
  }

  async getJson(url, opts) {
    return getJson(url, Object.assign({ limiter: this.limiter }, opts || {}));
  }

  async getText(url, opts) {
    return getText(url, Object.assign({ limiter: this.limiter }, opts || {}));
  }

  normalize(partial) {
    return universalResult(Object.assign({}, partial, { source: this.id }));
  }

  normalizeMany(partials) {
    return (partials || []).map((p) => this.normalize(p)).filter((r) => r.title != null || r.id != null);
  }

  // --- Adapter interface (override in subclasses) -------------------------

  async search(_query, _options) {
    throw new Error(`${this.id}: search() not implemented`);
  }

  async getItem(id, _options) {
    throw new Error(`${this.id}: getItem(${id}) not implemented`);
  }

  async getMetadata(id, options) {
    return this.getItem(id, options);
  }

  async getRelated(_id, _options) {
    return [];
  }

  async healthCheck() {
    // Default: tiny metadata probe. Override for a source-specific probe.
    return { id: this.id, status: 'unknown', latencyMs: null, detail: 'no health probe defined' };
  }

  stubStatus(status, detail) {
    return { id: this.id, status: status || 'not_implemented', latencyMs: 0, detail: detail || 'stub adapter: no public API implementation' };
  }
}

function makeStubSource(meta, detail) {
  // Factory for honest stub adapters (implemented:false): returns [] and
  // reports its declared status — never fabricated results.
  class StubSource extends BaseKnowledgeSource {
    async search(_q, _o) { return []; }
    async getItem(_id, _o) { return null; }
    async healthCheck() { return this.stubStatus(meta.status || 'not_implemented', detail); }
  }
  return StubSource;
}

module.exports = {
  BaseKnowledgeSource,
  universalResult,
  normalizeResult: universalResult,
  classifyLicense,
  noValue,
  pickFirst,
  MISSING_STRING,
  MISSING_VALUE,
  makeStubSource,
  KnowledgeHttpError,
};
