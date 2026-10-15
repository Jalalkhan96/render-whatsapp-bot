/*
 * sources/aggregators/opensanctions.cjs — OpenSanctions dataset-catalogue adapter.
 *
 * LIMITED BY DESIGN. Full entity screening search at
 * https://api.opensanctions.org requires an API key; this adapter does not
 * fabricate sanctions hits. Instead it uses the public, keyless dataset
 * catalogue (verified 2026-10-05):
 *   https://data.opensanctions.org/datasets/latest/index.json
 * and filters dataset metadata client-side by the query, returning
 * dataset-level results (type 'dataset').
 *
 * The catalogue is cached in memory (24h TTL) so repeated searches cost
 * one HTTP request per day at most.
 * OpenSanctions data carries its own licence/terms; per-source licensing
 * is surfaced in metadata as reported by the catalogue.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'opensanctions',
  name: 'OpenSanctions',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://www.opensanctions.org',
  docsUrl: 'https://www.opensanctions.org/docs/api/',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: ['OPENSANCTIONS_API_KEY'],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: false,
    license: false, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 4,
  description: 'LIMITED: searches the public OpenSanctions dataset catalogue (data.opensanctions.org datasets index) and returns dataset-level metadata results only — no entity screening, no sanctions hits. Full entity search at api.opensanctions.org requires an API key (OPENSANCTIONS_API_KEY). Sanctions/corporate data is lawful/public sources only; never fabricated.',
};

const INDEX_URL = 'https://data.opensanctions.org/datasets/latest/index.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let _catalog = null;
let _catalogAt = 0;

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function datasetText(d) {
  return [
    d.name, d.title, d.summary, d.description,
    d.publisher && (d.publisher.name || d.publisher.title),
    d.publisher && d.publisher.country,
    Array.isArray(d.countries) ? d.countries.join(' ') : d.countries,
    d.type,
  ].filter(Boolean).join(' ');
}

class OpenSanctionsSource extends BaseKnowledgeSource {
  async _catalogue() {
    const now = Date.now();
    if (_catalog && now - _catalogAt < CACHE_TTL_MS) return _catalog;
    const data = await this.getJson(INDEX_URL);
    const list = data && Array.isArray(data.datasets) ? data.datasets : [];
    _catalog = list;
    _catalogAt = now;
    return _catalog;
  }

  _mapDataset(d) {
    return {
      id: d.name ? `opensanctions:${d.name}` : null,
      sourceId: d.name || null,
      sourceUrl: d.name ? `https://www.opensanctions.org/datasets/${d.name}/` : null,
      title: d.title || d.name || null,
      description: d.summary || d.description || null,
      type: 'dataset',
      creator: (d.publisher && (d.publisher.name || d.publisher.title)) || null,
      date: d.last_change || d.updated_at || null,
      updatedAt: d.updated_at || null,
      language: null,
      country: (d.publisher && d.publisher.country) || null,
      contentUrl: d.name ? `https://www.opensanctions.org/datasets/${d.name}/` : null,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: 'https://www.opensanctions.org/licensing/',
      rights: 'unknown',
      identifiers: { opensanctions_dataset: d.name || null },
      tags: Array.isArray(d.countries) ? d.countries.filter((c) => typeof c === 'string').slice(0, 8) : [],
      categories: d.type ? [String(d.type)] : [],
      coordinates: { lat: null, lon: null },
      metadata: {
        datasetType: d.type || null,
        entityCount: d.entity_count != null ? d.entity_count : (d.entities_count != null ? d.entities_count : null),
        publisher: (d.publisher && (d.publisher.name || d.publisher.title)) || null,
        dataUpdatedAt: d.data_updated_at || null,
        note: 'Dataset metadata only — entity screening search requires an OpenSanctions API key.',
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    let catalogue;
    try {
      catalogue = await this._catalogue();
    } catch (_) {
      return [];
    }
    const qTokens = tokens(q);
    if (!qTokens.length) return [];
    const scored = [];
    for (const d of catalogue) {
      const text = datasetText(d).toLowerCase();
      let score = 0;
      for (const t of qTokens) {
        if (text.includes(t)) score += 1;
      }
      if (score > 0) scored.push({ d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return this.normalizeMany(scored.slice(0, limit).map((s) => this._mapDataset(s.d)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(INDEX_URL);
      const n = data && Array.isArray(data.datasets) ? data.datasets.length : 0;
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: `dataset catalogue reachable (${n} datasets); entity search requires API key` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new OpenSanctionsSource(deps, meta);
}

module.exports = { meta, createSource };
