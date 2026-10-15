/*
 * sources/government/datagov.cjs — Data.gov U.S. federal open-data catalog.
 *
 * MIGRATION NOTE (verified live 2026-10-05): catalog.data.gov is NO LONGER a
 * CKAN portal — https://catalog.data.gov/api/3/action/package_search now
 * answers 404 "Not Found" to every CKAN request. Data.gov replaced it with
 * the GSA Catalog API (Flask/OpenSearch, DCAT-US records):
 *   GET https://api.gsa.gov/technology/datagov/v4/search?searchTerm=<q>&pageSize=<n>&api_key=<key>
 * Without api_key it answers 403 { code: "API_KEY_MISSING" } — verified.
 *
 * An api.data.gov key is therefore REQUIRED (DATA_GOV_API_KEY or
 * API_DATA_GOV_KEY). Without one this adapter reports status 'auth_required'
 * and search() returns []. Result-shape mapping follows the Catalog API
 * docs (resources.data.gov/catalog-api) defensively, since no key was
 * available to verify the response body in this environment.
 *
 * docs: https://resources.data.gov/catalog-api/
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  for (const n of ['DATA_GOV_API_KEY', 'API_DATA_GOV_KEY']) {
    const v = process.env[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

const meta = {
  id: 'datagov',
  name: 'Data.gov (U.S. Federal Open Data)',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://api.gsa.gov/technology/datagov/v4',
  docsUrl: 'https://resources.data.gov/catalog-api/',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['DATA_GOV_API_KEY', 'API_DATA_GOV_KEY'],
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
  priority: 6,
  description: 'U.S. federal open-data catalog via the GSA Data.gov v4 ' +
    'Catalog API (GET /v4/search?searchTerm=&pageSize=&api_key=). The legacy ' +
    'CKAN endpoint on catalog.data.gov was verified dead (404) 2026-10-05, ' +
    'so the v4 API is used. API key REQUIRED: without DATA_GOV_API_KEY ' +
    'status is auth_required and search returns []. Type dataset.',
};

class DatagovSource extends BaseKnowledgeSource {
  _extractDatasets(data) {
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.datasets)) return data.datasets;
    if (data.data && Array.isArray(data.data.datasets)) return data.data.datasets;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data)) return data;
    return [];
  }

  _mapDataset(d) {
    d = d || {};
    const publisher = (d.publisher && typeof d.publisher === 'object') ? d.publisher : {};
    const dists = Array.isArray(d.distribution) ? d.distribution
      : (Array.isArray(d.distributions) ? d.distributions : []);
    const firstDist = dists.length && typeof dists[0] === 'object' ? dists[0] : {};
    const contentUrl = firstStr(firstDist.downloadURL) || firstStr(firstDist.accessURL) || firstStr(d.landingPage);
    const tags = Array.isArray(d.keyword) ? d.keyword.filter((t) => typeof t === 'string' && t.trim())
      : (Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : []);
    return {
      id: firstStr(d.identifier) || firstStr(d.id),
      sourceId: firstStr(d.identifier) || firstStr(d.id),
      sourceUrl: firstStr(d.landingPage) || contentUrl,
      title: firstStr(d.title),
      description: firstStr(d.description),
      type: 'dataset',
      creator: firstStr(publisher.name),
      date: firstStr(d.issued) || firstStr(d.modified),
      updatedAt: firstStr(d.modified),
      country: 'United States',
      contentUrl: contentUrl,
      license: 'unknown',
      rights: 'unknown',
      identifiers: { datasetId: firstStr(d.identifier) || firstStr(d.id) },
      tags: tags,
      metadata: {
        publisher: firstStr(publisher.name),
        distributions: dists.length,
        distributionFormats: dists.map((x) => firstStr(x && (x.mediaType || x.format))).filter(Boolean),
        themes: Array.isArray(d.theme) ? d.theme.filter((t) => typeof t === 'string') : [],
      },
    };
  }

  async search(query, options) {
    const key = readKey();
    if (!key) return [];
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://api.gsa.gov/technology/datagov/v4/search', {
      searchTerm: String(query).trim(),
      pageSize: limit,
      api_key: key,
    });
    const data = await this.getJson(url);
    const datasets = this._extractDatasets(data);
    return this.normalizeMany(datasets.slice(0, limit).map((d) => this._mapDataset(d)));
  }

  async healthCheck() {
    const key = readKey();
    if (!key) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'DATA_GOV_API_KEY not set; Data.gov v4 Catalog API requires an api.data.gov key' };
    }
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://api.gsa.gov/technology/datagov/v4/search', { searchTerm: 'test', pageSize: 1, api_key: key });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Data.gov v4 Catalog API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new DatagovSource(deps, meta);
}

module.exports = { meta, createSource };
