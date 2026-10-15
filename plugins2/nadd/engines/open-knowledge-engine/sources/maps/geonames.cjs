/*
 * sources/maps/geonames.cjs — GeoNames geographical database adapter.
 *
 * Endpoint (verified 2026-10-05 — response shape confirmed):
 *   http://api.geonames.org/searchJSON?q=<q>&maxRows=20
 *     &username=<GEONAMES_USERNAME>
 *
 * REQUIRES a free registered GeoNames username (GEONAMES_USERNAME).
 * Without it: implemented:true, status 'auth_required', search [].
 * GeoNames data is CC-BY-4.0 (attribution required).
 * Coordinates come from the API (lat/lng); missing -> null (§75).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'geonames',
  name: 'GeoNames',
  category: 'maps',
  transport: 'api',
  baseUrl: 'https://www.geonames.org',
  docsUrl: 'https://www.geonames.org/export/geonames-search.html',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['GEONAMES_USERNAME'],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: true,
    license: true, citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, maxResults: 20 },
  priority: 5,
  description: 'GeoNames geographical database via searchJSON. REQUIRES a free registered GeoNames username in GEONAMES_USERNAME — without it the adapter reports auth_required and returns no results. Data is CC-BY-4.0.',
};

const SEARCH_URL = 'http://api.geonames.org/searchJSON';

class GeoNamesSource extends BaseKnowledgeSource {
  _username() {
    const u = (this.deps && this.deps.GEONAMES_USERNAME) || process.env.GEONAMES_USERNAME;
    return typeof u === 'string' && u.trim() !== '' ? u.trim() : null;
  }

  _mapHit(hit) {
    return {
      id: `geonames:${hit.geonameId}`,
      sourceId: hit.geonameId != null ? String(hit.geonameId) : null,
      sourceUrl: hit.geonameId != null ? `https://www.geonames.org/${hit.geonameId}` : null,
      title: hit.name || null,
      description: hit.fcodeName || hit.fclName || null,
      type: 'place',
      creator: null,
      date: null,
      language: null,
      country: hit.countryName || hit.countryCode || null,
      contentUrl: hit.geonameId != null ? `https://www.geonames.org/${hit.geonameId}` : null,
      thumbnailUrl: null,
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      rights: 'unknown',
      identifiers: { geonames_id: hit.geonameId != null ? String(hit.geonameId) : null },
      tags: [hit.fcode || null, hit.fcl || null].filter(Boolean),
      categories: [],
      coordinates: { lat: hit.lat != null ? hit.lat : null, lon: hit.lng != null ? hit.lng : null },
      metadata: {
        place: {
          name: hit.name || null,
          country: hit.countryName || null,
          region: hit.adminName1 || null,
          population: hit.population != null ? Number(hit.population) : null,
          timezone: hit.timezone && hit.timezone.timeZoneId ? hit.timezone.timeZoneId : (hit.timezone || null),
          wikipediaUrl: hit.wikipediaURL || null,
          wikidataId: null,
          geonamesId: hit.geonameId != null ? String(hit.geonameId) : null,
        },
        featureClass: hit.fcl || null,
        featureCode: hit.fcode || null,
        score: hit.score != null ? Number(hit.score) : null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const username = this._username();
    if (!username) return [];
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(SEARCH_URL, { q, maxRows: limit, username, style: 'FULL' });
    const data = await this.getJson(url);
    if (data && data.status) {
      // GeoNames error payload (e.g. invalid username): surface nothing (§75).
      return [];
    }
    const hits = Array.isArray(data && data.geonames) ? data.geonames : [];
    return this.normalizeMany(hits.map((h) => this._mapHit(h)));
  }

  async healthCheck() {
    const t0 = Date.now();
    const username = this._username();
    if (!username) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'GEONAMES_USERNAME not set — register free at geonames.org/login' };
    }
    try {
      const data = await this.getJson(this._buildUrl(SEARCH_URL, { q: 'test', maxRows: 1, username }));
      if (data && data.status) {
        return { id: this.id, status: 'auth_required', latencyMs: Date.now() - t0, detail: `GeoNames rejected credentials: ${String(data.status.message || '').slice(0, 160)}` };
      }
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'GeoNames searchJSON probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new GeoNamesSource(deps, meta);
}

module.exports = { meta, createSource };
