/*
 * sources/museums/harvard.cjs — Harvard Art Museums API adapter (optional key).
 *
 * Official API: GET https://api.harvardartmuseums.org/object
 *   params: q=<q>, apikey=<HARVARD_API_KEY>, size=20
 * Requires a free API key (env HARVARD_API_KEY). Keyless -> auth_required,
 * search returns [] and healthCheck reports 'auth_required' — never fabricated.
 * Verified 2026-10-05: keyless request returns HTTP 401.
 * License: from the record's own `copyright` field via classifyLicense;
 * missing copyright -> 'unknown' (never assumed public domain).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://api.harvardartmuseums.org/object';

const meta = {
  id: 'harvard',
  name: 'Harvard Art Museums',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://api.harvardartmuseums.org',
  docsUrl: 'https://github.com/harvardartmuseums/api-docs',
  implemented: true,
  status: process.env.HARVARD_API_KEY ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['HARVARD_API_KEY'],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 7,
  description: 'Harvard Art Museums API: keyless requests are rejected (HTTP 401). Needs a free API key (HARVARD_API_KEY); without one search returns [].',
};

class HarvardSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
    this.apiKey = (deps && (deps.apiKey || deps.key)) || process.env.HARVARD_API_KEY || null;
  }

  _map(r) {
    const people = Array.isArray(r.people) ? r.people : [];
    const names = people
      .filter((p) => p && typeof p.displayname === 'string' && p.displayname.trim())
      .map((p) => p.displayname.trim());
    const rid = r.objectid != null ? String(r.objectid) : null;
    const copyright = r.copyright != null && String(r.copyright).trim() ? String(r.copyright).trim() : undefined;
    return {
      id: rid,
      sourceId: rid,
      sourceUrl: typeof r.url === 'string' && r.url.trim() ? r.url.trim() : null,
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null,
      type: 'artwork',
      creator: names.join('; ') || null,
      date: typeof r.dated === 'string' && r.dated.trim() ? r.dated.trim() : null,
      thumbnailUrl: typeof r.primaryimageurl === 'string' && r.primaryimageurl.trim() ? r.primaryimageurl.trim() : null,
      contentUrl: typeof r.url === 'string' && r.url.trim() ? r.url.trim() : null,
      // Record's own copyright statement -> classifyLicense; missing stays 'unknown'.
      license: copyright,
      licenseUrl: null,
      rights: copyright != null ? copyright : 'unknown',
      identifiers: { objectId: rid },
      metadata: {
        medium: r.medium || null,
        department: r.department || null,
        culture: r.culture || null,
        dimensions: r.dimensions || null,
        classification: r.classification || null,
        period: r.period || null,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    if (!this.apiKey) return []; // auth_required path: no key configured
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(API_BASE, { q: String(query), apikey: this.apiKey, size: limit });
    const data = await this.getJson(url);
    const records = data && Array.isArray(data.records) ? data.records : [];
    return this.normalizeMany(records.slice(0, limit).map((r) => this._map(r)));
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'HARVARD_API_KEY not configured; search disabled' };
    }
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API_BASE, { q: 'test', apikey: this.apiKey, size: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Harvard Art Museums API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new HarvardSource(deps, meta) };
