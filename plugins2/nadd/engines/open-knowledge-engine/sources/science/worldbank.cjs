/*
 * sources/science/worldbank.cjs — World Bank Open Data adapter ('limited').
 *
 * API (verified 2026-10-05, live):
 *   https://api.worldbank.org/v2/indicator?format=json&per_page=100&page=N
 *   https://api.worldbank.org/v2/country?format=json&per_page=310
 * Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-api-basic-call-structure
 *
 * The API is structured, not full-text: search() is a 'limited'
 * implementation that page-walks the indicator catalogue (bounded by
 * maxPages) and filters client-side by query text against indicator
 * id / name / source note / topics, returning INDICATOR METADATA ONLY —
 * never values. If the query looks like a country name, the country
 * catalogue is resolved too. No statistics are fabricated; apiUrl points
 * at the real World Bank API for the actual data.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'worldbank',
  name: 'World Bank Open Data',
  category: 'statistics',
  transport: 'api',
  baseUrl: 'https://api.worldbank.org/v2',
  docsUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-api-basic-call-structure',
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
    'World Bank Open Data (limited): search() page-walks the indicator ' +
    'catalogue (bounded pages) and filters client-side by query text, ' +
    'returning indicator metadata only (name, source note, topics, source ' +
    'organisation) with apiUrl pointing at the real API. Never returns ' +
    'fabricated values; country-name queries also resolve the country ' +
    'catalogue.',
};

function tokensOf(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

class WorldBankSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
    this._countryCache = null;
  }

  _matchScore(hay, toks) {
    let hits = 0;
    for (const t of toks) if (hay.includes(t)) hits += 1;
    return hits;
  }

  async _countries() {
    if (this._countryCache) return this._countryCache;
    const url = this._buildUrl('https://api.worldbank.org/v2/country', { format: 'json', per_page: 310 });
    const data = await this.getJson(url);
    const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    this._countryCache = rows.filter((c) => c && typeof c === 'object');
    return this._countryCache;
  }

  async _indicatorPages(toks, limit) {
    const maxPages = 5;
    const perPage = 100;
    const matches = [];
    for (let page = 1; page <= maxPages && matches.length < limit; page += 1) {
      const url = this._buildUrl('https://api.worldbank.org/v2/indicator', {
        format: 'json', per_page: perPage, page,
      });
      let data;
      try {
        data = await this.getJson(url);
      } catch (_e) {
        break;
      }
      const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
      if (rows.length === 0) break;
      for (const ind of rows) {
        if (!ind || typeof ind !== 'object' || matches.length >= limit) break;
        const topics = Array.isArray(ind.topics) ? ind.topics.map((t) => (t && t.value) || '').join(' ') : '';
        const hay = `${ind.id || ''} ${ind.name || ''} ${ind.sourceNote || ''} ${topics}`.toLowerCase();
        if (this._matchScore(hay, toks) > 0) matches.push(ind);
      }
    }
    return matches;
  }

  _toIndicatorResult(ind) {
    const id = noValue(ind.id, null);
    const topics = Array.isArray(ind.topics) ? ind.topics : [];
    const topicNames = topics.map((t) => t && t.value).filter((v) => typeof v === 'string' && v.trim() !== '');
    const src = ind.source || {};
    return dataset({
      id,
      source: this.id,
      sourceId: id,
      sourceUrl: id ? `https://data.worldbank.org/indicator/${encodeURIComponent(id)}` : null,
      title: noValue(ind.name, null),
      description: noValue(ind.sourceNote, null),
      type: 'dataset',
      creator: noValue(ind.sourceOrganization, null) || noValue(src.value, null),
      publisher: 'World Bank',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      categories: topicNames.slice(0, 5),
      tags: ['world-bank', 'indicator'],
      apiUrl: id ? `https://api.worldbank.org/v2/country/all/indicator/${encodeURIComponent(id)}?format=json` : null,
      identifiers: id ? { worldbank_indicator: String(id) } : {},
      metadata: {},
      datasetMetadata: {
        unit: noValue(ind.unit, null),
        sourceId: noValue(src.id, null),
        sourceName: noValue(src.value, null),
        note: 'metadata only — query the apiUrl for actual values',
      },
    });
  }

  _toCountryResult(c) {
    const code = noValue(c.id, null);
    return dataset({
      id: code ? `country:${code}` : null,
      source: this.id,
      sourceId: code,
      sourceUrl: 'https://data.worldbank.org/country',
      title: noValue(c.name, null),
      description: [
        c.region && c.region.value ? `Region: ${c.region.value}` : null,
        c.incomeLevel && c.incomeLevel.value ? `Income level: ${c.incomeLevel.value}` : null,
        c.capitalCity ? `Capital: ${c.capitalCity}` : null,
      ].filter(Boolean).join('; ') || null,
      type: 'dataset',
      creator: 'World Bank',
      publisher: 'World Bank',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      categories: ['country'],
      tags: ['world-bank', 'country'],
      apiUrl: code ? `https://api.worldbank.org/v2/country/${encodeURIComponent(code)}?format=json` : null,
      identifiers: code ? { worldbank_country: String(code), iso2: noValue(c.iso2Code, null) } : {},
      metadata: {},
      datasetMetadata: { note: 'country metadata only — pair with an indicator apiUrl for values' },
    });
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    const toks = tokensOf(query);
    if (toks.length === 0) return [];
    const out = [];
    try {
      // 1) country-name resolution
      try {
        const countries = await this._countries();
        const ql = String(query).toLowerCase().trim();
        const cm = countries.find((c) => {
          if (!c) return false;
          return (
            String(c.name || '').toLowerCase() === ql ||
            String(c.id || '').toLowerCase() === ql ||
            String(c.iso2Code || '').toLowerCase() === ql
          );
        });
        if (cm) out.push(this._toCountryResult(cm));
      } catch (_e) { /* country catalogue optional */ }
      // 2) indicator catalogue page-walk, client-side filter
      const inds = await this._indicatorPages(toks, Math.max(limit - out.length, 1));
      for (const ind of inds) {
        if (out.length >= limit) break;
        out.push(this._toIndicatorResult(ind));
      }
      return this.normalizeMany(out);
    } catch (_err) {
      return out.length > 0 ? this.normalizeMany(out) : [];
    }
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://api.worldbank.org/v2/indicator', { format: 'json', per_page: 1, page: 1 });
      const data = await this.getJson(url);
      const total = Array.isArray(data) && data[0] ? data[0].total : null;
      return {
        id: this.id,
        status: 'ok',
        latencyMs: Date.now() - t0,
        detail: `indicator catalogue probe ok (${total != null ? total : '?'} indicators total; search is metadata-only, client-side filtered)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new WorldBankSource(deps, meta),
};
