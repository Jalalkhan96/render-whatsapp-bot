/*
 * sources/science/who.cjs — WHO Global Health Observatory (GHO) OData adapter ('limited').
 *
 * API (verified 2026-10-05, live):
 *   https://ghoapi.azureedge.net/api/Indicator          (~415 KB JSON list)
 *   https://ghoapi.azureedge.net/api/<IndicatorCode>    (OData values endpoint)
 * Docs: https://www.who.int/data/gho/info/gho-odata-api
 *
 * 'limited': search() fetches the indicator catalogue once (cached in
 * memory, ~415 KB), filters client-side by query text against IndicatorName
 * / IndicatorCode, and returns INDICATOR METADATA ONLY — never values.
 * apiUrl points at the real OData endpoint for the actual data. Nothing
 * is fabricated; missing fields stay null/'unknown'.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'who',
  name: 'WHO Global Health Observatory',
  category: 'statistics',
  transport: 'api',
  baseUrl: 'https://ghoapi.azureedge.net/api',
  docsUrl: 'https://www.who.int/data/gho/info/gho-odata-api',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
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
  priority: 2,
  description:
    'WHO Global Health Observatory OData API (limited): search() filters ' +
    'the cached indicator catalogue client-side by query text and returns ' +
    'indicator metadata only (IndicatorName, IndicatorCode) with apiUrl ' +
    'pointing at the real OData values endpoint. Never returns fabricated ' +
    'values.',
};

function tokensOf(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

class WhoSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
    this._indicatorCache = null;
  }

  async _indicators() {
    if (this._indicatorCache) return this._indicatorCache;
    const data = await this.getJson('https://ghoapi.azureedge.net/api/Indicator');
    const rows = data && Array.isArray(data.value) ? data.value : [];
    this._indicatorCache = rows.filter((r) => r && typeof r === 'object');
    return this._indicatorCache;
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    const toks = tokensOf(query);
    if (toks.length === 0) return [];
    try {
      const inds = await this._indicators();
      const scored = [];
      for (const ind of inds) {
        const code = String(ind.IndicatorCode || '');
        const name = String(ind.IndicatorName || '');
        const hay = `${code} ${name}`.toLowerCase();
        let hits = 0;
        for (const t of toks) if (hay.includes(t)) hits += 1;
        if (hits === 0) continue;
        // Prefer matches in the code, then shorter (more specific) names.
        const codeHit = toks.some((t) => code.toLowerCase().includes(t)) ? 1000 : 0;
        scored.push({ ind, score: hits * 100 + codeHit - Math.min(name.length / 50, 10) });
        if (scored.length > 500) break; // memory protection
      }
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit).map((s) => this._toResult(s.ind));
      return this.normalizeMany(results);
    } catch (_err) {
      return [];
    }
  }

  _toResult(ind) {
    const code = noValue(ind.IndicatorCode, null);
    return dataset({
      id: code,
      source: this.id,
      sourceId: code,
      sourceUrl: null,
      title: noValue(ind.IndicatorName, null),
      description: code ? `WHO GHO indicator ${code}. Values are not included — query the apiUrl for data.` : null,
      type: 'dataset',
      creator: 'World Health Organization',
      publisher: 'WHO Global Health Observatory',
      language: noValue(ind.Language, null),
      license: 'unknown',
      categories: ['health'],
      tags: ['who', 'gho', 'indicator'],
      apiUrl: code ? `https://ghoapi.azureedge.net/api/${encodeURIComponent(code)}` : null,
      identifiers: code ? { who_gho_indicator: String(code) } : {},
      metadata: {},
      datasetMetadata: {
        indicatorCode: code,
        note: 'metadata only — query the apiUrl (OData) for actual values',
      },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const inds = await this._indicators();
      return {
        id: this.id,
        status: inds.length > 0 ? 'ok' : 'degraded',
        latencyMs: Date.now() - t0,
        detail: `Indicator catalogue returned ${inds.length} indicator(s); search is metadata-only, client-side filtered`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new WhoSource(deps, meta),
};
