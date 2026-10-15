/*
 * sources/museums/artic.cjs — Art Institute of Chicago API adapter (REAL).
 *
 * Official API: GET https://api.artic.edu/api/v1/artworks/search
 *   params: q=<q>, limit=20, fields=id,title,artist_display,date_display,
 *           image_id,thumbnail,is_public_domain,artwork_type_title,description
 * Images via IIIF: https://www.artic.edu/iiif/2/<image_id>/full/400,/0/default.jpg
 * Verified live 2026-10-05. Keyless, no signup.
 * License comes from the record's own is_public_domain flag; anything else is
 * reported 'unknown'.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const API_BASE = 'https://api.artic.edu/api/v1';
const IIIF_BASE = 'https://www.artic.edu/iiif/2';

const FIELDS = [
  'id', 'title', 'artist_display', 'date_display', 'image_id', 'thumbnail',
  'is_public_domain', 'artwork_type_title', 'description', 'medium_display',
  'department_title', 'culture_titles', 'dimensions',
].join(',');

const meta = {
  id: 'artic',
  name: 'Art Institute of Chicago',
  category: 'museum',
  transport: 'api',
  baseUrl: 'https://api.artic.edu',
  docsUrl: 'https://api.artic.edu/docs/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 1,
  description: 'Art Institute of Chicago public API: keyless Elasticsearch-backed artwork search with IIIF images.',
};

class ArticSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
  }

  _map(a) {
    const aid = a.id != null ? String(a.id) : null;
    const pd = a.is_public_domain === true;
    const thumb = a.thumbnail && typeof a.thumbnail === 'object' ? a.thumbnail : null;
    return {
      id: aid,
      sourceId: aid,
      sourceUrl: aid ? `https://www.artic.edu/artworks/${aid}` : null,
      title: typeof a.title === 'string' && a.title.trim() ? a.title.trim() : null,
      description: thumb && typeof thumb.alt_text === 'string' && thumb.alt_text.trim()
        ? thumb.alt_text.trim()
        : null,
      type: 'artwork',
      creator: typeof a.artist_display === 'string' && a.artist_display.trim() ? a.artist_display.trim() : null,
      date: typeof a.date_display === 'string' && a.date_display.trim() ? a.date_display.trim() : null,
      thumbnailUrl: typeof a.image_id === 'string' && a.image_id.trim()
        ? `${IIIF_BASE}/${a.image_id.trim()}/full/400,/0/default.jpg`
        : null,
      contentUrl: aid ? `https://www.artic.edu/artworks/${aid}` : null,
      license: pd ? 'public-domain' : 'unknown', // record's own flag; never assumed
      licenseUrl: null,
      rights: pd ? 'Public Domain' : 'unknown',
      identifiers: { objectId: aid },
      metadata: {
        medium: a.medium_display || null,
        department: a.department_title || null,
        culture: Array.isArray(a.culture_titles) ? a.culture_titles.filter((x) => typeof x === 'string').join('; ') || null : null,
        dimensions: a.dimensions || null,
        artworkType: a.artwork_type_title || null,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API_BASE}/artworks/search`, { q: String(query), limit, fields: FIELDS });
    const data = await this.getJson(url);
    const rows = data && Array.isArray(data.data) ? data.data : [];
    return this.normalizeMany(rows.slice(0, limit).map((a) => this._map(a)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/artworks/search`, { q: 'test', limit: 1, fields: 'id' }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'AIC artworks API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new ArticSource(deps, meta) };
