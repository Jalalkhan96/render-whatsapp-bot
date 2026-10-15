/*
 * sources/museums/wellcome.cjs — Wellcome Collection catalogue adapter (REAL).
 *
 * Official API: GET https://api.wellcomecollection.org/catalogue/v2/works
 *   params: query=<q>, pageSize=20
 * Keyless, no signup. Verified live 2026-10-05: returns {results:[{id, title,
 * contributors, production, thumbnail, availabilities, workType, ...}]}.
 * No per-work license field is exposed -> license stays 'unknown'.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://api.wellcomecollection.org/catalogue/v2';

const meta = {
  id: 'wellcome',
  name: 'Wellcome Collection',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://api.wellcomecollection.org',
  docsUrl: 'https://developers.wellcomecollection.org/docs/catalogue/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 3,
  description: 'Wellcome Collection catalogue: keyless v2 works search over the medical-history library, museum and archive holdings.',
};

function agentLabel(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.agent && typeof c.agent.label === 'string' && c.agent.label.trim()) return c.agent.label.trim();
  return null;
}

function productionDate(p) {
  if (!p || typeof p !== 'object') return null;
  if (Array.isArray(p.dates)) {
    for (const d of p.dates) {
      if (d && typeof d.label === 'string' && d.label.trim()) return d.label.trim();
    }
  }
  return null;
}

class WellcomeSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
  }

  _map(w) {
    const creators = Array.isArray(w.contributors) ? w.contributors.map(agentLabel).filter(Boolean) : [];
    const dates = Array.isArray(w.production) ? w.production.map(productionDate).filter(Boolean) : [];
    const thumb = w.thumbnail && typeof w.thumbnail.url === 'string' ? w.thumbnail.url : null;
    const availability = Array.isArray(w.availabilities)
      ? w.availabilities.map((a) => (a && a.label) || null).filter(Boolean)
      : [];
    const wid = w.id != null ? String(w.id) : null;
    return {
      id: wid,
      sourceId: wid,
      sourceUrl: wid ? `https://wellcomecollection.org/works/${wid}` : null,
      title: typeof w.title === 'string' && w.title.trim() ? w.title.trim() : null,
      description: typeof w.physicalDescription === 'string' && w.physicalDescription.trim() ? w.physicalDescription.trim() : null,
      type: 'object',
      creator: creators.join('; ') || null,
      date: dates[0] || null,
      thumbnailUrl: thumb,
      contentUrl: wid ? `https://wellcomecollection.org/works/${wid}` : null,
      license: 'unknown', // v2 works API exposes no rights field — never assumed
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { objectId: wid },
      metadata: {
        workType: w.workType && w.workType.label ? w.workType.label : null,
        medium: null,
        department: null,
        culture: null,
        dimensions: null,
        availabilities: availability,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API_BASE}/works`, { query: String(query), pageSize: limit });
    const data = await this.getJson(url);
    const results = data && Array.isArray(data.results) ? data.results : [];
    return this.normalizeMany(results.slice(0, limit).map((w) => this._map(w)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/works`, { query: 'test', pageSize: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Wellcome catalogue v2 API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new WellcomeSource(deps, meta) };
