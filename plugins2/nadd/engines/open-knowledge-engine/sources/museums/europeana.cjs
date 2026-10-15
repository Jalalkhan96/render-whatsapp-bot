/*
 * sources/museums/europeana.cjs — Europeana cultural-heritage aggregator adapter.
 *
 * Official API: GET https://api.europeana.eu/record/v2/search.json
 *   params: wskey=<EUROPEANA_API_KEY>, query=<q>, rows=20
 * Requires a free API key (env EUROPEANA_API_KEY). Keyless -> auth_required,
 * search returns [] and healthCheck reports 'auth_required' — never fabricated.
 * Verified 2026-10-05: keyless request returns HTTP 401.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://api.europeana.eu/record/v2';

const meta = {
  id: 'europeana',
  name: 'Europeana',
  category: 'culture',
  transport: 'api',
  baseUrl: 'https://api.europeana.eu',
  docsUrl: 'https://pro.europeana.eu/developers/apis',
  implemented: true,
  status: process.env.EUROPEANA_API_KEY ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['EUROPEANA_API_KEY'],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 5,
  description: 'Europeana aggregation of European museum, library and archive collections. Needs a free API key (EUROPEANA_API_KEY); keyless requests are rejected (HTTP 401).',
};

function toList(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== '').map(String);
  if (v == null || String(v).trim() === '') return [];
  return [String(v)];
}

function rightsInfo(rightsArr) {
  // Use the record's own rights statement — never assume public domain.
  const r = toList(rightsArr)[0];
  if (!r) return { license: 'unknown', licenseUrl: null, rights: 'unknown' };
  const lower = r.toLowerCase();
  if (lower.includes('publicdomain')) return { license: 'public-domain', licenseUrl: r, rights: r };
  if (lower.includes('creativecommons.org')) return { license: r, licenseUrl: r, rights: r };
  if (/all rights reserved|rightsstatements\.org\/page\/(inc|nd)/i.test(r)) {
    return { license: 'all-rights-reserved', licenseUrl: r, rights: r };
  }
  return { license: 'unknown', licenseUrl: r, rights: r };
}

class EuropeanaSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
    this.apiKey = (deps && (deps.apiKey || deps.key)) || process.env.EUROPEANA_API_KEY || null;
  }

  _map(item) {
    const titles = toList(item.title);
    const creators = toList(item.dcCreator).concat(toList(item.dcContributor));
    const previews = toList(item.edmPreview).concat(toList(item.edmIsShownBy));
    const r = rightsInfo(item.rights);
    const eurId = item.id != null ? String(item.id) : null;
    return {
      id: eurId,
      sourceId: eurId,
      sourceUrl: item.guid || null,
      title: titles[0] || null,
      description: toList(item.dcDescription)[0] || null,
      type: 'object',
      creator: creators.join('; ') || null,
      date: toList(item.year || item.dcDate)[0] || null,
      thumbnailUrl: previews[0] || null,
      contentUrl: item.guid || null,
      license: r.license,
      licenseUrl: r.licenseUrl,
      rights: r.rights,
      identifiers: { objectId: eurId },
      metadata: {
        dataProvider: toList(item.dataProvider)[0] || null,
        provider: toList(item.provider)[0] || null,
        medium: toList(item.dcFormat)[0] || null,
        department: null,
        culture: null,
        dimensions: null,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    if (!this.apiKey) return []; // auth_required path: no key configured
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API_BASE}/search.json`, {
      wskey: this.apiKey,
      query: String(query),
      rows: limit,
      profile: 'standard',
    });
    const data = await this.getJson(url);
    const items = data && Array.isArray(data.items) ? data.items : [];
    return this.normalizeMany(items.slice(0, limit).map((it) => this._map(it)));
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'EUROPEANA_API_KEY not configured; search disabled' };
    }
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/search.json`, { wskey: this.apiKey, query: 'test', rows: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Europeana record API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new EuropeanaSource(deps, meta) };
