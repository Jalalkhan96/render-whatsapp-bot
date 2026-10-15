/*
 * sources/museums/met-museum.cjs — Metropolitan Museum of Art Collection adapter (REAL).
 *
 * Official API (DEVIATION — documented in report):
 *   The v1 search endpoint /public/collection/v1/search was RETIRED 2026-10-01.
 *   This adapter uses the replacement Elastic-backed endpoint:
 *     GET https://collectionapi.metmuseum.org/public/collection/v1.1/search
 *       params: q=<q>, limit=<n> -> {total, objectIDs[]}
 *     GET https://collectionapi.metmuseum.org/public/collection/v1/objects/<id>
 *       -> {objectID, title, artistDisplayName, objectDate, medium, department,
 *           culture, dimensions, primaryImageSmall, objectURL, isPublicDomain}
 * Verified live 2026-10-05: v1/search returns a retirement message; v1.1/search
 * returns objectIDs; /objects/<id> returns full records.
 * Keyless, no signup. License comes from the record's own isPublicDomain flag.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://collectionapi.metmuseum.org/public/collection';
const MAX_DETAIL_FETCHES = 8; // bounded: memory protection

const meta = {
  id: 'met-museum',
  name: 'The Met (Metropolitan Museum of Art)',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://collectionapi.metmuseum.org',
  docsUrl: 'https://metmuseum.github.io/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 2,
  description: 'Metropolitan Museum of Art Collection API: keyless two-step search (v1.1 object search, then per-object detail).',
};

class MetMuseumSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
  }

  _map(o) {
    const oid = o.objectID != null ? String(o.objectID) : null;
    const pd = o.isPublicDomain === true;
    const tags = [];
    if (Array.isArray(o.tags)) {
      for (const t of o.tags) {
        if (t && typeof t.term === 'string' && t.term.trim()) tags.push(t.term.trim());
      }
    }
    return {
      id: oid,
      sourceId: oid,
      sourceUrl: typeof o.objectURL === 'string' && o.objectURL.trim() ? o.objectURL.trim() : null,
      title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
      type: 'artwork',
      creator: typeof o.artistDisplayName === 'string' && o.artistDisplayName.trim() ? o.artistDisplayName.trim() : null,
      date: typeof o.objectDate === 'string' && o.objectDate.trim() ? o.objectDate.trim() : null,
      thumbnailUrl: typeof o.primaryImageSmall === 'string' && o.primaryImageSmall.trim() ? o.primaryImageSmall.trim() : null,
      contentUrl: typeof o.objectURL === 'string' && o.objectURL.trim() ? o.objectURL.trim() : null,
      license: pd ? 'public-domain' : 'unknown', // record's own flag; never assumed
      licenseUrl: null,
      rights: pd ? 'Public Domain' : 'unknown',
      tags,
      identifiers: { objectId: oid },
      metadata: {
        medium: o.medium || null,
        department: o.department || null,
        culture: o.culture || null,
        dimensions: o.dimensions || null,
        artistDisplayBio: o.artistDisplayBio || null,
        classification: o.classification || null,
        accessionNumber: o.accessionNumber || null,
      },
    };
  }

  async _fetchObject(oid) {
    try {
      const o = await this.getJson(`${API_BASE}/v1/objects/${encodeURIComponent(String(oid))}`);
      return o && typeof o === 'object' && o.objectID != null ? o : null;
    } catch (_err) {
      return null; // one bad record must not sink the whole search
    }
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const searchUrl = this._buildUrl(`${API_BASE}/v1.1/search`, { q: String(query), limit });
    const data = await this.getJson(searchUrl);
    const ids = data && Array.isArray(data.objectIDs) ? data.objectIDs : [];
    const want = ids.slice(0, Math.min(limit, MAX_DETAIL_FETCHES));
    const partials = [];
    // Sequential detail fetches: bounded and polite under the rate limiter.
    for (const oid of want) {
      // eslint-disable-next-line no-await-in-loop
      const o = await this._fetchObject(oid);
      if (o) partials.push(this._map(o));
    }
    return this.normalizeMany(partials);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/v1.1/search`, { q: 'test', limit: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Met Collection v1.1 search reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new MetMuseumSource(deps, meta) };
