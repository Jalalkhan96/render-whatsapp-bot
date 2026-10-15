/*
 * sources/maps/openstreetmap.cjs — OpenStreetMap Nominatim geocoding adapter.
 *
 * Endpoint (verified 2026-10-05 via status.php; /search is the official API):
 *   https://nominatim.openstreetmap.org/search?q=<q>&format=json
 *     &limit=<n>&addressdetails=1
 *
 * STRICT POLITENESS (§80): max 1 request/sec enforced via
 *   rateLimit { requestsPerMinute: 30, delayMs: 2000 }.
 * Identification via User-Agent + contact from OPENKNOWLEDGE_CONTACT
 * (core/http.cjs sends it; ensure OPENKNOWLEDGE_CONTACT is set in .env).
 * NO BULK SCRAPING per the Nominatim usage policy —
 * https://operations.osmfoundation.org/policies/nominatim/
 * Results are 'place' type with real coordinates from the API only
 * (§75 NO FABRICATION: lat/lon come from the response; missing -> null).
 * OSM data © OpenStreetMap contributors, ODbL-1.0.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'openstreetmap',
  name: 'OpenStreetMap (Nominatim)',
  category: 'maps',
  transport: 'api',
  baseUrl: 'https://nominatim.openstreetmap.org',
  docsUrl: 'https://nominatim.org/release-docs/develop/api/Search/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: true,
    license: true, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxResults: 20 },
  priority: 1,
  description: 'OpenStreetMap place/address geocoding via the official Nominatim search API. STRICT 1 req/sec politeness; no bulk scraping per the usage policy. OSM data is © OpenStreetMap contributors under ODbL-1.0. Requires OPENKNOWLEDGE_CONTACT set for identification.',
};

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

class OpenStreetMapSource extends BaseKnowledgeSource {
  _mapHit(hit) {
    const addr = hit.address || {};
    return {
      id: `openstreetmap:${hit.place_id}`,
      sourceId: hit.place_id != null ? String(hit.place_id) : null,
      sourceUrl: hit.osm_id != null && hit.osm_type
        ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` : null,
      title: hit.display_name || null,
      description: hit.type || null,
      type: 'place',
      creator: null,
      date: null,
      language: null,
      country: addr.country || null,
      contentUrl: hit.osm_id != null && hit.osm_type
        ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` : null,
      thumbnailUrl: null,
      license: 'ODbL-1.0',
      licenseUrl: 'https://www.openstreetmap.org/copyright',
      rights: 'unknown',
      identifiers: {
        osm_type: hit.osm_type || null,
        osm_id: hit.osm_id != null ? String(hit.osm_id) : null,
        place_id: hit.place_id != null ? String(hit.place_id) : null,
      },
      tags: [hit.class || null, hit.type || null].filter(Boolean),
      categories: [],
      coordinates: { lat: hit.lat != null ? hit.lat : null, lon: hit.lon != null ? hit.lon : null },
      metadata: {
        place: {
          name: addr.city || addr.town || addr.village || addr.hamlet
            || addr.suburb || addr.county || addr.state || null,
          country: addr.country || null,
          region: addr.state || addr.county || null,
          population: null,
          timezone: null,
          wikipediaUrl: hit.extratags && hit.extratags.wikipedia
            ? `https://${hit.extratags.wikipedia.replace(':', '.wikipedia.org/wiki/')}` : null,
          wikidataId: hit.extratags && hit.extratags.wikidata ? hit.extratags.wikidata : null,
          geonamesId: null,
        },
        displayName: hit.display_name || null,
        importance: hit.importance != null ? Number(hit.importance) : null,
        osmClass: hit.class || null,
        osmType: hit.type || null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(SEARCH_URL, {
      q,
      format: 'json',
      limit,
      addressdetails: 1,
      extratags: 1,
    });
    const data = await this.getJson(url);
    const hits = Array.isArray(data) ? data : [];
    return this.normalizeMany(hits.map((h) => this._mapHit(h)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(SEARCH_URL, { q: 'test', format: 'json', limit: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Nominatim search probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: `Nominatim probe failed: ${String(err.message).slice(0, 180)}` };
    }
  }
}

function createSource(deps) {
  return new OpenStreetMapSource(deps, meta);
}

module.exports = { meta, createSource };
