/*
 * sources/aggregators/geonames-wikipedia.cjs — GeoNames Wikipedia Search adapter.
 *
 * Endpoint (verified 2026-10-05 — live, responded with an auth status):
 *   http://api.geonames.org/wikipediaSearchJSON?q=<q>&maxRows=20&username=<GEONAMES_USERNAME>
 * Returns nearby / relevant Wikipedia entries with title, summary, lat/lng,
 * feature type and the Wikipedia article URL.
 *
 * Requires GEONAMES_USERNAME (free registration at geonames.org/login).
 * Without it the API answers {"status":{"message":"invalid user","value":10}},
 * so the adapter reports 'auth_required' and search() returns [].
 * GeoNames data is CC-BY (attribution required).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const hasUsername = Boolean(process.env.GEONAMES_USERNAME && process.env.GEONAMES_USERNAME.trim());

const meta = {
  id: 'geonames-wikipedia',
  name: 'GeoNames Wikipedia Search',
  category: 'geography',
  transport: 'api',
  baseUrl: 'http://api.geonames.org',
  docsUrl: 'https://www.geonames.org/export/web-services.html',
  implemented: true,
  status: hasUsername ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['GEONAMES_USERNAME'],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: true,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 3,
  description: 'GeoNames wikipediaSearchJSON — Wikipedia entries near/relevant to a query, with titles, summaries, coordinates and article URLs. Requires a free GeoNames username (GEONAMES_USERNAME). Reports auth_required and returns [] without it. GeoNames data is CC-BY (attribution required).',
};

const API = 'http://api.geonames.org/wikipediaSearchJSON';

class GeonamesWikipediaSource extends BaseKnowledgeSource {
  _username() {
    const u = process.env.GEONAMES_USERNAME;
    return u && u.trim() ? u.trim() : null;
  }

  _mapEntry(e) {
    return {
      id: e.title ? `geonames-wikipedia:${e.title}` : null,
      sourceId: e.title || null,
      sourceUrl: e.wikipediaUrl || null,
      title: e.title || null,
      description: e.summary || null,
      type: 'place',
      creator: null,
      date: null,
      language: e.lang || null,
      country: e.countryCode || null,
      contentUrl: e.wikipediaUrl || null,
      thumbnailUrl: e.thumbnailImg || null,
      license: 'unknown',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      rights: 'unknown',
      identifiers: { geonamesId: e.geonameId != null ? e.geonameId : null, feature: e.feature || null },
      tags: [],
      categories: [],
      coordinates: {
        lat: Number.isFinite(Number(e.lat)) ? Number(e.lat) : null,
        lon: Number.isFinite(Number(e.lng)) ? Number(e.lng) : null,
      },
      metadata: {
        dataLicense: 'CC-BY (GeoNames)',
        elevation: e.elevation != null && e.elevation !== '' ? Number(e.elevation) : null,
        population: e.population != null && e.population !== '' ? Number(e.population) : null,
        feature: e.feature || null,
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
    const lang = options.lang ? String(options.lang).toLowerCase().slice(0, 8) : undefined;
    const url = this._buildUrl(API, { q, maxRows: limit, username, lang });
    const data = await this.getJson(url);
    if (data && data.status && data.status.value === 10) return []; // invalid user
    const entries = data && Array.isArray(data.geonames) ? data.geonames : [];
    return this.normalizeMany(entries.map((e) => this._mapEntry(e)));
  }

  async healthCheck() {
    const t0 = Date.now();
    const username = this._username();
    if (!username) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'GEONAMES_USERNAME not set — free username required (geonames.org/login)' };
    }
    try {
      const data = await this.getJson(this._buildUrl(API, { q: 'test', maxRows: 1, username }));
      if (data && data.status && data.status.value === 10) {
        return { id: this.id, status: 'auth_required', latencyMs: Date.now() - t0, detail: 'GeoNames rejected the username (invalid user)' };
      }
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'wikipediaSearchJSON probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new GeonamesWikipediaSource(deps, meta);
}

module.exports = { meta, createSource };
