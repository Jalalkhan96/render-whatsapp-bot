/*
 * sources/government/nara-catalog.cjs — National Archives Catalog
 * (spec #027 — separate adapter id for the NARA catalog surface).
 *
 * NOTE: this adapter intentionally shares the same backend as the 'nara'
 * adapter — the NARA Catalog v2 API (GET
 * https://catalog.archives.gov/api/v2/records/search with an x-api-key
 * header). The legacy v1 API was verified dead (returns SPA HTML)
 * 2026-10-05, and the v2 endpoint is key-gated: without NARA_API_KEY this
 * adapter reports status 'auth_required' and search() returns [].
 * It is kept as a distinct adapter id per the engine spec so the catalog
 * surface can be configured, prioritised and health-checked independently
 * of the general NARA adapter.
 *
 * Response: { body: { hits: { total: { value }, hits: [ { _source:
 *   { naId, title, scopeAndContentNote, ... } } ] } } }
 * Record links: https://catalog.archives.gov/id/<naId>.
 *
 * docs: https://github.com/usnationalarchives/catalog-api
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  const v = process.env.NARA_API_KEY;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const meta = {
  id: 'nara-catalog',
  name: 'National Archives Catalog',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://catalog.archives.gov',
  docsUrl: 'https://github.com/usnationalarchives/catalog-api',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['NARA_API_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    images: true,
    documents: true,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 6,
  description: 'National Archives Catalog as a distinct adapter id (spec ' +
    '#027); shares the NARA Catalog v2 API with the nara adapter ' +
    '(GET /api/v2/records/search, x-api-key header). API key REQUIRED: ' +
    'without NARA_API_KEY status is auth_required and search returns []. ' +
    'naId links to catalog.archives.gov/id/<naId>. License kept as unknown.',
};

class NaraCatalogSource extends BaseKnowledgeSource {
  _extractHits(data) {
    const hits = data && data.body && data.body.hits && data.body.hits.hits;
    return Array.isArray(hits) ? hits : [];
  }

  _mapHit(h) {
    const s = (h && h._source && typeof h._source === 'object') ? h._source : {};
    const naId = s.naId != null ? String(s.naId) : null;
    const description = firstStr(s.scopeAndContentNote) || firstStr(s.description) ||
      firstStr(s.administrativeHistoryNote);
    return {
      id: naId,
      sourceId: naId,
      sourceUrl: naId ? `https://catalog.archives.gov/id/${naId}` : null,
      title: firstStr(s.title),
      description: description,
      type: firstStr(s.typeOfDescription) || firstStr(s.levelOfDescription) || 'record',
      creator: firstStr(s.creator),
      date: firstStr(s.date),
      country: 'United States',
      license: 'unknown',
      rights: 'unknown',
      identifiers: { naId: naId },
      metadata: {
        levelOfDescription: firstStr(s.levelOfDescription),
        typeOfResource: firstStr(s.typeOfResource),
      },
    };
  }

  async search(query, options) {
    const key = readKey();
    if (!key) return [];
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://catalog.archives.gov/api/v2/records/search', {
      q: String(query).trim(),
      limit: limit,
    });
    const data = await this.getJson(url, { headers: { 'x-api-key': key } });
    const hits = this._extractHits(data);
    return this.normalizeMany(hits.slice(0, limit).map((h) => this._mapHit(h)));
  }

  async healthCheck() {
    const key = readKey();
    if (!key) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'NARA_API_KEY not set; the NARA Catalog v2 API requires an x-api-key header' };
    }
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://catalog.archives.gov/api/v2/records/search', { q: 'test', limit: 1 });
      await this.getJson(url, { headers: { 'x-api-key': key }, timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'NARA Catalog v2 records/search reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new NaraCatalogSource(deps, meta);
}

module.exports = { meta, createSource };
