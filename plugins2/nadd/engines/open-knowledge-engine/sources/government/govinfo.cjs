/*
 * sources/government/govinfo.cjs — U.S. Government Publishing Office (govinfo).
 *
 * Endpoint: POST https://api.govinfo.gov/search?offset=<n>&pageSize=<n>&api_key=<key>
 *   with JSON body { "query": "<q>" }   (GET is rejected with 400)
 * Response: { count, results: [ { title, collectionCode, collectionName,
 *   category, dateIssued, detailsLink, packageId, ... }, ... ] }
 *
 * Live-verified 2026-10-05: without api_key the API answers
 * 401 API_KEY_MISSING; with api_key=DEMO_KEY it accepts the key and the POST
 * form (400 only when the body is missing). The key is OPTIONAL: when
 * GOVINFO_KEY is unset this adapter falls back to the public DEMO_KEY, which
 * is heavily rate-limited — hence default status 'limited'. The full POST
 * result shape could not be verified end-to-end from this sandbox (search
 * POSTs timed out), so mapping follows api.govinfo.gov/docs defensively.
 *
 * docs: https://api.govinfo.gov/docs
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { request } = require('../../core/http.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  const v = process.env.GOVINFO_KEY;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const meta = {
  id: 'govinfo',
  name: 'GovInfo (U.S. Government Publishing Office)',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://api.govinfo.gov',
  docsUrl: 'https://api.govinfo.gov/docs',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: ['GOVINFO_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    images: false,
    documents: true,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 7,
  description: 'Official U.S. federal publications (Congressional Record, ' +
    'Federal Register, bills, reports...) via the govinfo Search API ' +
    '(POST /search with JSON body; GET rejected). API key optional: without ' +
    'GOVINFO_KEY it falls back to the public DEMO_KEY and is rate-limited ' +
    '(status limited). Result-shape mapping per api.govinfo.gov/docs.',
};

class GovinfoSource extends BaseKnowledgeSource {
  _keyInUse() {
    return readKey() || 'DEMO_KEY';
  }

  _mapResult(r) {
    r = r || {};
    return {
      id: firstStr(r.packageId) || firstStr(r.granuleId),
      sourceId: firstStr(r.packageId) || firstStr(r.granuleId),
      sourceUrl: firstStr(r.detailsLink) || firstStr(r.url),
      title: firstStr(r.title),
      description: firstStr(r.teaser) || firstStr(r.summary),
      type: 'document',
      creator: firstStr(r.publisher),
      date: firstStr(r.dateIssued) || firstStr(r.publishDate),
      country: 'United States',
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        packageId: firstStr(r.packageId),
        granuleId: firstStr(r.granuleId),
        collectionCode: firstStr(r.collectionCode),
      },
      categories: [firstStr(r.collectionName), firstStr(r.category)].filter(Boolean),
      metadata: {
        collection: firstStr(r.collectionName),
        category: firstStr(r.category),
        branch: firstStr(r.branch),
      },
    };
  }

  async _postSearch(query, limit, timeoutMs) {
    const url = this._buildUrl('https://api.govinfo.gov/search', {
      offset: 0,
      pageSize: limit,
      api_key: this._keyInUse(),
    });
    const res = await request(url, {
      limiter: this.limiter,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: String(query).trim() }),
      timeoutMs: timeoutMs || 20000,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`govinfo: invalid JSON response (${String(text).slice(0, 120)})`);
    }
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const data = await this._postSearch(query, limit);
    const results = (data && Array.isArray(data.results)) ? data.results : [];
    return this.normalizeMany(results.slice(0, limit).map((r) => this._mapResult(r)));
  }

  async healthCheck() {
    const t0 = Date.now();
    const limited = !readKey();
    try {
      await this._postSearch('test', 1, 10000);
      return {
        id: this.id,
        status: limited ? 'limited' : 'ok',
        latencyMs: Date.now() - t0,
        detail: limited ? 'reachable via DEMO_KEY fallback (rate-limited)' : 'govinfo search reachable with API key',
      };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new GovinfoSource(deps, meta);
}

module.exports = { meta, createSource };
