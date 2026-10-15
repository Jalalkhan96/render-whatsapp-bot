/*
 * sources/science/noaa.cjs — NOAA Climate Data Online (CDO) v2 adapter.
 *
 * API: https://www.ncdc.noaa.gov/cdo-web/api/v2/datasets?limit=N
 * Docs: https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation
 * Auth: free token via header `token:<NOAA_TOKEN>` (env NOAA_TOKEN).
 *
 * Verified 2026-10-05: without a token the endpoint returns
 * HTTP 400 {"status":"400","message":"Token parameter is required."}
 * -> implemented:true, status 'auth_required', requiresKey:true;
 * search() returns [] and healthCheck() reports auth_required.
 * With a token, search() lists datasets and filters client-side by query
 * text (the CDO datasets endpoint is not full-text searchable).
 * Never fabricates values: missing fields stay null/'unknown'.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'noaa',
  name: 'NOAA Climate Data Online',
  category: 'science',
  transport: 'api',
  baseUrl: 'https://www.ncdc.noaa.gov/cdo-web/api/v2',
  docsUrl: 'https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['NOAA_TOKEN'],
  capabilities: {
    search: true,
    metadata: true,
    api: true,
    bulk: false,
    license: true,
    citations: false,
    coordinates: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 3,
  description:
    'NOAA Climate Data Online (CDO) v2 dataset catalogue. Requires a free ' +
    'NOAA token (env NOAA_TOKEN, sent as header token:<token>). Without a ' +
    'token the adapter reports auth_required and search returns []. With a ' +
    'token, search() lists datasets and filters client-side by query text, ' +
    'returning dataset metadata (no values fabricated).',
};

function tokensOf(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

class NoaaSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _token() {
    return (this.deps && this.deps.NOAA_TOKEN) || process.env.NOAA_TOKEN || null;
  }

  async search(query, options) {
    options = options || {};
    const token = this._token();
    if (!token) return [];
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl('https://www.ncdc.noaa.gov/cdo-web/api/v2/datasets', { limit: 25 });
      const data = await this.getJson(url, { headers: { token: String(token) } });
      const sets = (data && Array.isArray(data.results)) ? data.results : [];
      const toks = tokensOf(query);
      const matched = sets
        .filter((d) => {
          if (!d || typeof d !== 'object') return false;
          if (toks.length === 0) return true;
          const hay = `${d.name || ''} ${d.id || ''}`.toLowerCase();
          return toks.some((t) => hay.includes(t));
        })
        .slice(0, limit);
      return this.normalizeMany(matched.map((d) => this._toResult(d)));
    } catch (_err) {
      return [];
    }
  }

  _toResult(d) {
    d = d || {};
    const uid = noValue(d.uid, null);
    const id = noValue(d.id, null);
    return dataset({
      id: uid || id,
      source: this.id,
      sourceId: id,
      sourceUrl: 'https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=' + encodeURIComponent(id || ''),
      title: noValue(d.name, null),
      description: noValue(d.datacoverage, null) != null
        ? `Data coverage: ${d.datacoverage}; ${noValue(d.mindate, '')} to ${noValue(d.maxdate, '')}`.trim()
        : null,
      type: 'dataset',
      creator: 'National Oceanic and Atmospheric Administration (NOAA)',
      date: noValue(d.mindate, null),
      updatedAt: noValue(d.maxdate, null),
      publisher: 'NOAA National Centers for Environmental Information',
      apiUrl: 'https://www.ncdc.noaa.gov/cdo-web/api/v2/datasets/' + encodeURIComponent(id || ''),
      identifiers: uid ? { noaa_uid: String(uid) } : {},
      categories: ['climate', 'weather'],
      metadata: {},
      datasetMetadata: {
        cdo_dataset_id: id,
        minDate: noValue(d.mindate, null),
        maxDate: noValue(d.maxdate, null),
        dataCoverage: noValue(d.datacoverage, null),
      },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    if (!this._token()) {
      return {
        id: this.id,
        status: 'auth_required',
        latencyMs: Date.now() - t0,
        detail: 'NOAA_TOKEN not set; CDO API requires header token:<NOAA_TOKEN> (verified 2026-10-05: no-token request -> HTTP 400 "Token parameter is required.")',
      };
    }
    try {
      const url = this._buildUrl('https://www.ncdc.noaa.gov/cdo-web/api/v2/datasets', { limit: 1 });
      const data = await this.getJson(url, { headers: { token: String(this._token()) } });
      const n = data && data.metadata && data.metadata.resultset ? data.metadata.resultset.count : '?';
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: `datasets probe ok (${n} datasets in catalogue)` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new NoaaSource(deps, meta),
};
