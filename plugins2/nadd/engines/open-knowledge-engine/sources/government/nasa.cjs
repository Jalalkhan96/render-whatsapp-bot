/*
 * sources/government/nasa.cjs — NASA Image and Video Library.
 *
 * Search endpoint (live-verified 2026-10-05):
 *   GET https://images-api.nasa.gov/search?q=<q>&media_type=image,video[&page_size=<n>]
 * Response: { collection: { items: [ { href (".../collection.json"),
 *   data: [ { title, description, description_508, date_created, nasa_id,
 *     keywords: [], media_type, center, album: [] } ],
 *   links: [ { href (thumbnail), rel, render, width, height } ] }, ... ] } }
 *
 * No API key required. License kept as unknown (NASA media reuse rules vary
 * per asset; this adapter does not assert a license).
 *
 * docs: https://images.nasa.gov/docs/
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const meta = {
  id: 'nasa',
  name: 'NASA Image and Video Library',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://images-api.nasa.gov',
  docsUrl: 'https://images.nasa.gov/docs/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    images: true,
    documents: false,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 8,
  description: 'NASA Image and Video Library via the images-api search ' +
    'endpoint (GET /search?q=&media_type=image,video; verified live ' +
    '2026-10-05). Maps data[0] title/description/date_created/nasa_id and ' +
    'links[0] thumbnail. No API key required. License kept as unknown.',
};

class NasaSource extends BaseKnowledgeSource {
  _mapItem(it) {
    it = it || {};
    const d = (Array.isArray(it.data) && it.data[0] && typeof it.data[0] === 'object') ? it.data[0] : {};
    const link = (Array.isArray(it.links) && it.links[0] && typeof it.links[0] === 'object') ? it.links[0] : {};
    const nasaId = firstStr(d.nasa_id);
    const mediaType = firstStr(d.media_type);
    return {
      id: nasaId,
      sourceId: nasaId,
      sourceUrl: firstStr(it.href),
      title: firstStr(d.title),
      description: firstStr(d.description) || firstStr(d.description_508),
      type: mediaType === 'video' ? 'video' : (mediaType === 'audio' ? 'audio' : 'image'),
      date: firstStr(d.date_created),
      thumbnailUrl: firstStr(link.href),
      license: 'unknown',
      rights: 'unknown',
      identifiers: { nasaId: nasaId },
      tags: Array.isArray(d.keywords) ? d.keywords.filter((t) => typeof t === 'string' && t.trim()) : [],
      metadata: {
        center: firstStr(d.center),
        mediaType: mediaType,
        album: Array.isArray(d.album) ? d.album.filter((t) => typeof t === 'string') : [],
        photographer: firstStr(d.photographer),
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(100, (options && options.limit) || 20));
    const url = this._buildUrl('https://images-api.nasa.gov/search', {
      q: String(query).trim(),
      media_type: 'image,video',
      page_size: limit,
    });
    const data = await this.getJson(url);
    const items = (data && data.collection && Array.isArray(data.collection.items)) ? data.collection.items : [];
    return this.normalizeMany(items.slice(0, limit).map((it) => this._mapItem(it)));
  }

  async getItem(id, _options) {
    if (!id || !String(id).trim()) return null;
    const rows = await this.search(String(id).trim(), { limit: 5 });
    return rows.length ? rows[0] : null;
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://images-api.nasa.gov/search', { q: 'test', media_type: 'image', page_size: 1 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'NASA images-api search reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new NasaSource(deps, meta);
}

module.exports = { meta, createSource };
