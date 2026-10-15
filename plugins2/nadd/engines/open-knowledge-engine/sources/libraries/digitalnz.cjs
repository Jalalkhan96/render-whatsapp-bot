/*
 * sources/libraries/digitalnz.cjs — DigitalNZ (api.digitalnz.org).
 *
 * DigitalNZ aggregates New Zealand cultural heritage records.
 * Endpoint verified live 2026-10-05:
 *   https://api.digitalnz.org/v3/records.json?api_key=<DIGITALNZ_KEY>&text=<q>&per_page=20
 * The API also answers WITHOUT a key (200 with results); the key is optional
 * (DIGITALNZ_KEY) and raises limits. Never send a key we do not have.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { BaseKnowledgeSource, noValue, pickFirst } = require('../../core/base-source.cjs');

const meta = {
  id: 'digitalnz',
  name: 'DigitalNZ',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://api.digitalnz.org/v3',
  docsUrl: 'https://digitalnz.org/developers',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: ['DIGITALNZ_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    images: true,
    documents: true,
    api: true,
    license: false,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 80,
  description: 'DigitalNZ — New Zealand libraries, museums, archives and galleries search API. Key optional (raises limits); works anonymously.',
};

const API = 'https://api.digitalnz.org/v3';

class DigitalNZSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
    this.apiKey = (deps && (deps.apiKey || deps.digitalnzKey)) || process.env.DIGITALNZ_KEY || null;
  }

  _params(text, perPage, extra) {
    const p = { text: String(text), per_page: perPage };
    if (this.apiKey) p.api_key = this.apiKey;
    return Object.assign(p, extra || {});
  }

  async search(query, options) {
    if (!query || String(query).trim() === '') return [];
    const opts = options || {};
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API}/records.json`, this._params(query, limit));
    const data = await this.getJson(url, { headers: { Accept: 'application/json' } });
    const results = data && data.search && Array.isArray(data.search.results) ? data.search.results : [];
    return this.normalizeMany(results.slice(0, limit).map(mapRecord));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const url = this._buildUrl(`${API}/records.json`, this._params('test', 1));
      const data = await this.getJson(url, { headers: { Accept: 'application/json' } });
      const n = data && data.search && typeof data.search.result_count === 'number' ? data.search.result_count : null;
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: n != null ? `DigitalNZ v3 reachable; probe matched ${n} record(s)` : 'DigitalNZ v3 reachable' };
    } catch (err) {
      return { id: this.id, status: 'unreachable', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

function firstOf(arr) {
  if (Array.isArray(arr)) {
    for (const v of arr) { if (v != null && String(v).trim() !== '') return String(v); }
    return null;
  }
  return noValue(arr, null);
}

function mapRecord(r) {
  r = r || {};
  const id = r.id != null ? String(r.id) : null;
  return {
    id: id ? `digitalnz-${id}` : null,
    sourceId: id,
    title: noValue(r.title, null),
    description: firstOf(r.description) || firstOf(r.additional_description),
    type: firstOf(r.dc_type) || firstOf(r.category) || 'unknown',
    creator: firstOf(r.creator),
    date: firstOf(r.display_date) || firstOf(r.date) || firstOf(r.published_date),
    language: firstOf(r.language),
    country: 'New Zealand',
    sourceUrl: noValue(r.landing_url, null) || (id ? `https://digitalnz.org/records/${id}` : null),
    contentUrl: noValue(r.object_url, null),
    thumbnailUrl: noValue(r.large_thumbnail_url, null) || noValue(r.thumbnail_url, null),
    license: 'unknown',
    licenseUrl: firstOf(r.rights_url),
    rights: firstOf(r.copyright) || noValue(r.rights, 'unknown'),
    identifiers: { digitalnzId: id },
    tags: Array.isArray(r.tag) ? r.tag.filter((t) => typeof t === 'string') : [],
    categories: Array.isArray(r.category) ? r.category.filter((t) => typeof t === 'string') : [],
    coordinates: { lat: null, lon: null },
    metadata: {
      contentPartner: firstOf(r.content_partner) || noValue(r.display_content_partner, null),
      collection: firstOf(r.primary_collection) || noValue(r.display_collection, null),
      subject: Array.isArray(r.subject) ? r.subject.filter((t) => typeof t === 'string') : [],
      publisher: firstOf(r.publisher),
      dnzType: noValue(r.dnz_type, null),
    },
  };
}

module.exports = { meta, createSource: (deps) => new DigitalNZSource(deps, meta) };
