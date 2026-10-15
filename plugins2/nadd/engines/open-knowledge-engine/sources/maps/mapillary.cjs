/*
 * sources/maps/mapillary.cjs — Mapillary street-level imagery adapter.
 *
 * Endpoint (shape verified 2026-10-05 — without a valid token it returns
 * an OAuthException; the API contract is documented at
 * https://www.mapillary.com/developer/api-documentation/):
 *   https://graph.mapillary.com/images?access_token=<MAPILLARY_TOKEN>
 *     &bbox=<minLon>,<minLat>,<maxLon>,<maxLat>&limit=<n>&fields=id,thumb_2048_url,computed_geometry,captured_at,creator
 *
 * OPTIONAL key: without MAPILLARY_TOKEN -> implemented:true, status
 * 'auth_required', search []. With a token, search() accepts either
 * options.lat/options.lon (with optional options.radius in metres) or a
 * "lat,lon" query string; it builds a bbox and returns street-level image
 * records with real coordinates from the API (§75: coordinates only from
 * the API; missing -> null). Get a token at mapillary.com/developer.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'mapillary',
  name: 'Mapillary',
  category: 'maps',
  transport: 'api',
  baseUrl: 'https://www.mapillary.com',
  docsUrl: 'https://www.mapillary.com/developer/api-documentation/',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['MAPILLARY_TOKEN'],
  capabilities: {
    search: true, metadata: true, fullText: false, images: true, documents: false,
    downloads: false, api: true, bulk: false, coordinates: true,
    license: true, citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, maxResults: 20 },
  priority: 7,
  description: 'Mapillary street-level imagery. Optional MAPILLARY_TOKEN: without it the adapter reports auth_required and returns no results. With a token, search by options.lat/options.lon (or "lat,lon" query) returns geolocated street-level photos. Imagery by contributors under CC-BY-SA unless stated otherwise.',
};

const GRAPH_URL = 'https://graph.mapillary.com/images';
const FIELDS = 'id,thumb_2048_url,computed_geometry,captured_at,creator,compass_angle';

class MapillarySource extends BaseKnowledgeSource {
  _token() {
    const t = (this.deps && this.deps.MAPILLARY_TOKEN) || process.env.MAPILLARY_TOKEN;
    return typeof t === 'string' && t.trim() !== '' ? t.trim() : null;
  }

  _bbox(lat, lon, radiusMeters) {
    const r = Math.max(10, Math.min(Number(radiusMeters) || 500, 50000));
    const dLat = r / 111320;
    const dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat].join(',');
  }

  _parseLatLon(query, options) {
    if (options && Number.isFinite(Number(options.lat)) && Number.isFinite(Number(options.lon))) {
      return { lat: Number(options.lat), lon: Number(options.lon), radius: options.radius };
    }
    const m = String(query || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (m) return { lat: Number(m[1]), lon: Number(m[2]), radius: options && options.radius };
    return null;
  }

  _mapHit(img) {
    const geom = img.computed_geometry || {};
    const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
    return {
      id: `mapillary:${img.id}`,
      sourceId: img.id != null ? String(img.id) : null,
      sourceUrl: img.id != null ? `https://www.mapillary.com/app/?pKey=${img.id}` : null,
      title: img.id != null ? `Mapillary image ${img.id}` : 'Mapillary image',
      description: null,
      type: 'image',
      creator: img.creator && img.creator.username ? img.creator.username : null,
      date: img.captured_at || null,
      language: null,
      country: null,
      contentUrl: img.thumb_2048_url || null,
      thumbnailUrl: img.thumb_2048_url || null,
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      rights: 'unknown',
      identifiers: { mapillary_image_id: img.id != null ? String(img.id) : null },
      tags: ['street-level'],
      categories: [],
      coordinates: { lat: coords.length === 2 ? coords[1] : null, lon: coords.length === 2 ? coords[0] : null },
      metadata: {
        capturedAt: img.captured_at || null,
        compassAngle: img.compass_angle != null ? Number(img.compass_angle) : null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const token = this._token();
    if (!token) return [];
    const pt = this._parseLatLon(query, options);
    if (!pt) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(GRAPH_URL, {
      access_token: token,
      bbox: this._bbox(pt.lat, pt.lon, pt.radius),
      limit,
      fields: FIELDS,
    });
    const data = await this.getJson(url);
    const hits = Array.isArray(data && data.data) ? data.data : [];
    return this.normalizeMany(hits.map((h) => this._mapHit(h)));
  }

  async healthCheck() {
    const t0 = Date.now();
    const token = this._token();
    if (!token) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'MAPILLARY_TOKEN not set — register an app at mapillary.com/developer' };
    }
    try {
      await this.getJson(this._buildUrl(GRAPH_URL, { access_token: token, limit: 1, fields: 'id' }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Mapillary graph API probe succeeded' };
    } catch (err) {
      const msg = String(err.message || '');
      const st = /401|403|OAuthException|token/i.test(msg) ? 'auth_required' : 'error';
      return { id: this.id, status: st, latencyMs: Date.now() - t0, detail: msg.slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new MapillarySource(deps, meta);
}

module.exports = { meta, createSource };
