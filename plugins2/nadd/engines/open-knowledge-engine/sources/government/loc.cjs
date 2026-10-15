/*
 * sources/government/loc.cjs — Library of Congress (loc.gov JSON API).
 *
 * Search endpoint (live-verified 2026-10-05):
 *   GET https://www.loc.gov/search/?q=<q>&fo=json[&c=<n>]
 * Response: { results: [ { title, id ("http://www.loc.gov/item/<id>/"), url,
 *   date, contributor, description, group, language, image_url,
 *   access_restricted, digitized, dates, number_lccn,
 *   item: { call_number, ... } }, ... ] }
 *
 * NOTE: the bare https://www.loc.gov/?q=<q>&fo=json returns the homepage
 * JSON, not search results — /search/ is the correct path.
 *
 * LOC enforces rate limits (HTTP 429); the engine's http layer backs off
 * automatically, and this adapter is capped at 20 requests/minute.
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
  id: 'loc',
  name: 'Library of Congress',
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
  priority: 8,
  description: 'Library of Congress digital collections via the loc.gov JSON API ' +
    '(GET /search/?q=&fo=json; verified live 2026-10-05). Maps title, item URL, ' +
    'call number, contributor, date, access_restricted flag and image_url. ' +
    'No API key required. Government records: license kept as unknown.',
};

class LocSource extends BaseKnowledgeSource {
  _mapItem(r) {
    r = r || {};
    const item = (r.item && typeof r.item === 'object') ? r.item : {};
    const locId = locIdFrom(r.id) || locIdFrom(r.url);
    const location = [];
    if (r.location) location.push(firstStr(r.location));
    return {
      id: locId,
      sourceId: locId || firstStr(r.id),
      sourceUrl: firstStr(r.url),
      title: firstStr(r.title),
      description: firstStr(r.description),
      type: firstStr(r.group) || 'item',
      creator: firstStr(r.contributor),
      date: firstStr(r.date),
      language: firstStr(r.language),
      thumbnailUrl: firstStr(r.image_url),
      license: 'unknown',
      rights: r.access_restricted === true ? 'access_restricted' : 'unknown',
      identifiers: {
        locId: locId,
        callNumber: firstStr(item.call_number),
        lccn: firstStr(r.number_lccn),
      },
      metadata: {
        accessRestricted: r.access_restricted === true,
        digitized: r.digitized === true,
        dates: Array.isArray(r.dates) ? r.dates : (r.dates || null),
        aka: Array.isArray(r.aka) ? r.aka : (r.aka || null),
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://www.loc.gov/search/', {
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
      const url = this._buildUrl('https://www.loc.gov/search/', { q: 'test', fo: 'json', c: 1 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'loc.gov search JSON endpoint reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new LocSource(deps, meta);
}

module.exports = { meta, createSource };
