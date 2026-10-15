/*
 * sources/museums/clevelandart.cjs — Cleveland Museum of Art Open Access adapter (REAL).
 *
 * Official API: GET https://openaccess-api.clevelandart.org/api/artworks/
 *   params: q=<q>, limit=20 -> {info, data:[{title, creators[{description,
 *   role}], creation_date, type, technique, department, culture, dimensions,
 *   images:{web:{url}}, url, copyright, ...}]}
 * Verified live 2026-10-05. Keyless, no signup.
 * License comes from the record's own `copyright` field via classifyLicense;
 * missing copyright -> 'unknown' (never assumed public domain).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://openaccess-api.clevelandart.org/api/artworks/';

const meta = {
  id: 'clevelandart',
  name: 'Cleveland Museum of Art',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://openaccess-api.clevelandart.org',
  docsUrl: 'https://openaccess-api.clevelandart.org/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 4,
  description: 'Cleveland Museum of Art Open Access API: keyless artwork search over the full open-access collection.',
};

class ClevelandArtSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
  }

  _map(a) {
    const creators = Array.isArray(a.creators) ? a.creators : [];
    const primary = creators.find((c) => c && typeof c.description === 'string' && c.description.trim())
      || creators[0] || null;
    const images = a.images && typeof a.images === 'object' ? a.images : {};
    const web = images.web && typeof images.web === 'object' ? images.web : {};
    const idStr = a.accession_number != null ? String(a.accession_number) : (a.id != null ? String(a.id) : null);
    return {
      id: idStr,
      sourceId: idStr,
      sourceUrl: typeof a.url === 'string' && a.url.trim() ? a.url.trim() : null,
      title: typeof a.title === 'string' && a.title.trim() ? a.title.trim() : null,
      description: typeof a.did_you_know === 'string' && a.did_you_know.trim() ? a.did_you_know.trim() : null,
      type: 'artwork',
      creator: primary && typeof primary.description === 'string' && primary.description.trim()
        ? primary.description.trim()
        : null,
      date: typeof a.creation_date === 'string' && a.creation_date.trim() ? a.creation_date.trim() : null,
      thumbnailUrl: typeof web.url === 'string' && web.url.trim() ? web.url.trim() : null,
      contentUrl: typeof a.url === 'string' && a.url.trim() ? a.url.trim() : null,
      // Record's own copyright statement -> classifyLicense in universalResult;
      // missing stays 'unknown', never assumed public domain.
      license: (a.copyright != null && String(a.copyright).trim()) ? String(a.copyright).trim() : undefined,
      licenseUrl: null,
      rights: a.copyright != null && String(a.copyright).trim() ? String(a.copyright).trim() : 'unknown',
      identifiers: { objectId: idStr },
      metadata: {
        medium: a.technique || a.medium || null,
        department: a.department || null,
        culture: Array.isArray(a.culture) ? a.culture.filter((x) => typeof x === 'string').join('; ') || null
          : (typeof a.culture === 'string' ? a.culture : null),
        dimensions: a.measurements || null,
        type: a.type || null,
        accessionNumber: a.accession_number || null,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(API_BASE, { q: String(query), limit });
    const data = await this.getJson(url);
    const rows = data && Array.isArray(data.data) ? data.data : [];
    return this.normalizeMany(rows.slice(0, limit).map((a) => this._map(a)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API_BASE, { q: 'test', limit: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'CMA Open Access API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new ClevelandArtSource(deps, meta) };
