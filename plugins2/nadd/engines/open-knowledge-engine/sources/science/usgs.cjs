/*
 * sources/science/usgs.cjs — USGS Earthquake Hazards Program adapter.
 *
 * API (verified 2026-10-05, live):
 *   https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson
 *   (GeoJSON FeatureCollection of M4.5+ earthquakes in the past day)
 * Docs: https://earthquake.usgs.gov/fdsnws/event/1/
 *
 * The FDSN event API is parameter-based, not full-text: search() is a
 * 'limited' implementation that fetches the day's M4.5+ feed and filters
 * client-side by query text against place names (e.g. "Japan", "Chile"),
 * or returns the strongest events when the query is quake-related
 * ("earthquake", "quake", "seismic", "tremor"). Coordinates are real
 * GeoJSON geometry values. Never fabricates statistics.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';

const meta = {
  id: 'usgs',
  name: 'USGS Earthquake Hazards Program',
  category: 'science',
  transport: 'api',
  baseUrl: 'https://earthquake.usgs.gov',
  docsUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    api: true,
    bulk: false,
    license: true,
    citations: false,
    coordinates: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 2,
  description:
    'USGS real-time earthquake feed (M4.5+ past day, GeoJSON). search() ' +
    'filters the live feed client-side by query text against place names, ' +
    'or returns the strongest recent events for quake-related queries. ' +
    'Coordinates, magnitudes and timestamps are real feed values; nothing ' +
    'is fabricated.',
};

const QUAKE_TERMS = ['earthquake', 'earthquakes', 'quake', 'quakes', 'seismic', 'tremor', 'tremors', 'temblor'];

function tokensOf(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !QUAKE_TERMS.includes(t));
}

function isoOrNull(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  try { return new Date(Number(ms)).toISOString(); } catch (_e) { return null; }
}

class UsgsSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async _feed() {
    const data = await this.getJson(FEED_URL);
    const feats = data && Array.isArray(data.features) ? data.features : [];
    return feats.filter((f) => f && f.type === 'Feature' && f.properties);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const feats = await this._feed();
      const ql = String(query || '').toLowerCase();
      const toks = tokensOf(query);
      const isQuakeQuery = QUAKE_TERMS.some((t) => ql.includes(t));
      let scored;
      if (toks.length === 0) {
        if (!isQuakeQuery) return [];
        // Quake-related query with no place filter: strongest events first.
        scored = feats.map((f) => ({ f, score: Number(f.properties.mag) || 0 }));
      } else {
        scored = feats
          .map((f) => {
            const hay = `${f.properties.place || ''} ${f.properties.title || ''}`.toLowerCase();
            const hits = toks.filter((t) => hay.includes(t)).length;
            return { f, score: hits };
          })
          .filter((s) => s.score > 0)
          .map((s) => ({ f: s.f, score: s.score * 100 + (Number(s.f.properties.mag) || 0) }));
      }
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit).map((s) => this._toResult(s.f));
      return this.normalizeMany(results);
    } catch (_err) {
      return [];
    }
  }

  _toResult(f) {
    const p = f.properties || {};
    const geom = (f.geometry && Array.isArray(f.geometry.coordinates)) ? f.geometry.coordinates : [];
    const lon = Number.isFinite(Number(geom[0])) ? Number(geom[0]) : null;
    const lat = Number.isFinite(Number(geom[1])) ? Number(geom[1]) : null;
    const mag = p.mag != null && Number.isFinite(Number(p.mag)) ? Number(p.mag) : null;
    const place = noValue(p.place, 'unknown location');
    const title = mag != null ? `M${mag} - ${place}` : String(place);
    const depthKm = geom.length >= 3 && Number.isFinite(Number(geom[2])) ? Number(geom[2]) : null;
    return dataset({
      id: noValue(f.id, null),
      source: this.id,
      sourceId: noValue(f.id, null),
      sourceUrl: noValue(p.url, null),
      title,
      description: [
        mag != null ? `Magnitude ${mag}` : null,
        depthKm != null ? `depth ${depthKm} km` : null,
        noValue(p.title, null),
        p.tsunami === 1 ? 'Tsunami flag set by USGS.' : null,
      ].filter(Boolean).join('. ') || null,
      type: 'dataset',
      creator: 'U.S. Geological Survey (USGS)',
      date: isoOrNull(p.time),
      updatedAt: isoOrNull(p.updated),
      publisher: 'USGS Earthquake Hazards Program',
      license: 'public-domain',
      coordinates: { lat, lon },
      identifiers: f.id ? { usgs_event: String(f.id) } : {},
      categories: ['earthquake', 'seismology'],
      tags: p.type ? [String(p.type)] : [],
      metadata: {},
      datasetMetadata: {
        magnitude: mag,
        magnitudeType: noValue(p.magType, null),
        depthKm,
        place: noValue(p.place, null),
        tsunamiFlag: p.tsunami === 1,
        status: noValue(p.status, null),
        eventTime: isoOrNull(p.time),
      },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const feats = await this._feed();
      return {
        id: this.id,
        status: feats.length > 0 ? 'ok' : 'degraded',
        latencyMs: Date.now() - t0,
        detail: `4.5_day.geojson feed returned ${feats.length} event(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new UsgsSource(deps, meta),
};
