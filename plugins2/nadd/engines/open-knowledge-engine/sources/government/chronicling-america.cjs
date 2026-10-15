/*
 * sources/government/chronicling-america.cjs — Chronicling America
 * (historic US newspapers) via the Library of Congress newspapers JSON feed.
 *
 * Search endpoint (live-verified 2026-10-05):
 *   GET https://www.loc.gov/newspapers/?q=<q>&fo=json[&c=<n>]
 * Response: { results: [ { title, id ("http://www.loc.gov/item/<lccn>/"),
 *   url, date, description, location_city, location_county, location_state,
 *   location_country, image_url, batch, number_lccn, ... }, ... ], pages: N }
 *
 * Design choice: the loc.gov /newspapers/ JSON feed serves the same
 * Chronicling America newspaper-title data and is live-verified; it is used
 * instead of the legacy chroniclingamerica.loc.gov JSON search, which was
 * not reachable from this environment.
 *
 * No API key required. Same LOC 20 requests/minute rate cap.
 *
 * docs: https://www.loc.gov/apis/
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function locIdFrom(itemUrl) {
  if (typeof itemUrl !== 'string') return null;
  const m = itemUrl.match(/\/item\/([^/?#]+)\/?$/);
  return m ? m[1] : null;
}

const meta = {
  id: 'chronicling-america',
  name: 'Chronicling America (Historic Newspapers)',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://www.loc.gov',
  docsUrl: 'https://www.loc.gov/apis/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    images: true,
    documents: true,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 20 },
  priority: 7,
  description: 'Historic US newspaper titles from the Chronicling America ' +
    'program, served through the live-verified loc.gov /newspapers/?q=&fo=json ' +
    'feed (2026-10-05). Maps title, LCCN, publication place, batch and item URL. ' +
    'No API key required. License kept as unknown.',
};

class ChroniclingAmericaSource extends BaseKnowledgeSource {
  _mapItem(r) {
    r = r || {};
    const locId = locIdFrom(r.id) || locIdFrom(r.url);
    const place = [r.location_city, r.location_county, r.location_state, r.location_country]
      .map(firstStr).filter(Boolean).join(', ') || null;
    return {
      id: locId,
      sourceId: locId || firstStr(r.id),
      sourceUrl: firstStr(r.url),
      title: firstStr(r.title),
      description: firstStr(r.description),
      type: 'newspaper',
      creator: firstStr(r.publisher) || firstStr(r.contributor),
      date: firstStr(r.date),
      language: firstStr(r.language),
      country: 'United States',
      thumbnailUrl: firstStr(r.image_url),
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        locId: locId,
        lccn: firstStr(r.number_lccn),
        batch: firstStr(r.batch),
      },
      metadata: {
        place: place,
        city: firstStr(r.location_city),
        state: firstStr(r.location_state),
        digitized: r.digitized === true,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://www.loc.gov/newspapers/', {
      q: String(query).trim(),
      fo: 'json',
      c: limit,
    });
    const data = await this.getJson(url);
    const results = (data && Array.isArray(data.results)) ? data.results : [];
    return this.normalizeMany(results.slice(0, limit).map((r) => this._mapItem(r)));
  }

  async getItem(id, _options) {
    if (!id || !String(id).trim()) return null;
    const clean = String(id).trim().replace(/^https?:\/\/[^/]+\/item\//, '').replace(/\/$/, '');
    const url = `https://www.loc.gov/item/${encodeURIComponent(clean)}/?fo=json`;
    const data = await this.getJson(url);
    const r = (data && data.item) || data || null;
    if (!r || typeof r !== 'object') return null;
    const rows = this.normalizeMany([this._mapItem(Object.assign({ id: r.id || `http://www.loc.gov/item/${clean}/`, url: r.url || `https://www.loc.gov/item/${clean}/` }, r))]);
    return rows.length ? rows[0] : null;
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://www.loc.gov/newspapers/', { q: 'test', fo: 'json', c: 1 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'loc.gov newspapers JSON feed reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new ChroniclingAmericaSource(deps, meta);
}

module.exports = { meta, createSource };
