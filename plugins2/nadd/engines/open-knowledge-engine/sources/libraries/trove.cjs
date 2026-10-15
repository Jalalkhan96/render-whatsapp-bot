/*
 * sources/libraries/trove.cjs — Trove (National Library of Australia).
 *
 * Trove aggregates Australian library, archive, museum and newspaper records.
 * API v3 requires a key: https://api.trove.nla.gov.au/v3/result?q=<q>&category=all&n=20&key=<TROVE_KEY>
 * Verified 2026-10-05: endpoint exists; without key it returns
 *   401 {"message":"No API key found in request"}.
 * Without TROVE_KEY this adapter reports auth_required and search() returns [].
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { BaseKnowledgeSource, pickFirst, noValue } = require('../../core/base-source.cjs');

const meta = {
  id: 'trove',
  name: 'Trove (National Library of Australia)',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://api.trove.nla.gov.au/v3',
  docsUrl: 'https://trove.nla.gov.au/about/create-something/using-api',
  implemented: true,
  status: 'ok',
  requiresKey: true,
  envKeys: ['TROVE_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    images: false,
    documents: true,
    api: true,
    license: false,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 80,
  description: 'Trove — books, journals, newspapers, maps and archives aggregated by the National Library of Australia. API key required (free via trove.nla.gov.au).',
};

const API = 'https://api.trove.nla.gov.au/v3';

class TroveSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
    this.apiKey = (deps && (deps.apiKey || deps.troveKey)) || process.env.TROVE_KEY || null;
  }

  _headers() { return { Accept: 'application/json' }; }

  _categoryFor(options) {
    const c = options && options.category;
    if (typeof c === 'string' && c.trim() !== '') return c.trim();
    return 'all';
  }

  async search(query, options) {
    if (!query || String(query).trim() === '') return [];
    if (!this.apiKey) return [];
    const opts = options || {};
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API}/result`, {
      q: String(query),
      category: this._categoryFor(opts),
      n: limit,
      key: this.apiKey,
    });
    let data;
    try {
      data = await this.getJson(url, { headers: this._headers() });
    } catch (err) {
      throw err;
    }
    const works = extractWorks(data);
    return this.normalizeMany(works.slice(0, limit).map(mapWork));
  }

  async healthCheck() {
    const t0 = Date.now();
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: Date.now() - t0, detail: 'TROVE_KEY not set — Trove API v3 requires a key' };
    }
    try {
      const url = this._buildUrl(`${API}/result`, { q: 'test', category: 'all', n: 1, key: this.apiKey });
      const data = await this.getJson(url, { headers: this._headers() });
      const works = extractWorks(data);
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: `Trove v3 reachable; probe returned ${works.length} work(s)` };
    } catch (err) {
      return { id: this.id, status: 'unreachable', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

function extractWorks(data) {
  // Trove v3 shape: { category: [ { code, records: { work: [ ... ] } } ] }
  if (!data || typeof data !== 'object') return [];
  const cats = Array.isArray(data.category) ? data.category : [];
  const out = [];
  for (const cat of cats) {
    const recs = cat && cat.records;
    if (recs && Array.isArray(recs.work)) out.push(...recs.work);
  }
  return out;
}

function mapWork(w) {
  w = w || {};
  const contributors = Array.isArray(w.contributor) ? w.contributor : (w.contributor ? [w.contributor] : []);
  const creator = contributors.filter((c) => c != null).join('; ') || null;
  const id = noValue(w.id, null);
  return {
    id: id != null ? `trove-${id}` : null,
    sourceId: id != null ? String(id) : null,
    title: noValue(w.title, null),
    description: noValue(w.snippet, null),
    type: noValue(w.type, 'unknown'),
    creator,
    date: noValue(w.issued, null),
    language: null,
    country: 'Australia',
    sourceUrl: noValue(w.url, null) || (id != null ? `https://trove.nla.gov.au/work/${id}` : null),
    contentUrl: null,
    thumbnailUrl: null,
    license: 'unknown',
    licenseUrl: null,
    rights: 'unknown',
    identifiers: { troveId: id != null ? String(id) : null, troveVersion: noValue(w.version, null) },
    tags: [],
    categories: [noValue(w.category, 'trove')].filter(Boolean),
    coordinates: { lat: null, lon: null },
    metadata: {
      holdingsCount: w.holdingsCount != null ? w.holdingsCount : null,
      versionCount: w.versionCount != null ? w.versionCount : null,
      relevance: w.relevance && w.relevance.score != null ? w.relevance.score : null,
    },
  };
}

module.exports = { meta, createSource: (deps) => new TroveSource(deps, meta) };
