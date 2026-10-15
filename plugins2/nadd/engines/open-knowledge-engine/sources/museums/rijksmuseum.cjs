/*
 * sources/museums/rijksmuseum.cjs — Rijksmuseum collection adapter (optional key).
 *
 * Official API: GET https://www.rijksmuseum.nl/api/en/collection
 *   params: key=<RIJKSMUSEUM_KEY>, q=<q>, ps=20
 * Requires a free API key (env RIJKSMUSEUM_KEY). Keyless -> auth_required,
 * search returns [] and healthCheck reports 'auth_required' — never fabricated.
 * Verified 2026-10-05: keyless request returns HTTP 410.
 * License: the collection search response carries no per-object rights field,
 * so license stays 'unknown'.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://www.rijksmuseum.nl/api/en/collection';

const meta = {
  id: 'rijksmuseum',
  name: 'Rijksmuseum',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://www.rijksmuseum.nl',
  docsUrl: 'https://data.rijksmuseum.nl/object-metadata/api/',
  implemented: true,
  status: process.env.RIJKSMUSEUM_KEY ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['RIJKSMUSEUM_KEY'],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 6,
  description: 'Rijksmuseum Amsterdam collection search. Needs a free API key (RIJKSMUSEUM_KEY); keyless requests are rejected.',
};

class RijksmuseumSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
    this.apiKey = (deps && (deps.apiKey || deps.key)) || process.env.RIJKSMUSEUM_KEY || null;
  }

  _map(a) {
    const webImage = a.webImage && typeof a.webImage.url === 'string' ? a.webImage.url : null;
    const links = a.links && typeof a.links === 'object' ? a.links : {};
    const dating = a.dating && typeof a.dating === 'object' ? a.dating : {};
    const obn = a.objectNumber != null ? String(a.objectNumber) : null;
    return {
      id: obn,
      sourceId: obn,
      sourceUrl: links.web || null,
      title: typeof a.title === 'string' && a.title.trim() ? a.title.trim() : null,
      description: typeof a.plaqueDescriptionEnglish === 'string' && a.plaqueDescriptionEnglish.trim()
        ? a.plaqueDescriptionEnglish.trim()
        : null,
      type: 'artwork',
      creator: typeof a.principalOrFirstMaker === 'string' && a.principalOrFirstMaker.trim()
        ? a.principalOrFirstMaker.trim()
        : null,
      date: typeof dating.presentingDate === 'string' && dating.presentingDate.trim() ? dating.presentingDate.trim() : null,
      thumbnailUrl: webImage,
      contentUrl: links.web || null,
      license: 'unknown', // no per-object rights field in the collection response
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { objectId: obn },
      metadata: {
        longTitle: a.longTitle || null,
        medium: null,
        department: null,
        culture: null,
        dimensions: null,
        productionPlaces: Array.isArray(a.productionPlaces) ? a.productionPlaces.filter((x) => typeof x === 'string') : [],
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    if (!this.apiKey) return []; // auth_required path: no key configured
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(API_BASE, { key: this.apiKey, q: String(query), ps: limit });
    const data = await this.getJson(url);
    const objects = data && Array.isArray(data.artObjects) ? data.artObjects : [];
    return this.normalizeMany(objects.slice(0, limit).map((a) => this._map(a)));
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'RIJKSMUSEUM_KEY not configured; search disabled' };
    }
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API_BASE, { key: this.apiKey, q: 'test', ps: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Rijksmuseum collection API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new RijksmuseumSource(deps, meta) };
