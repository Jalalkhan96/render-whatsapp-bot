/*
 * sources/aggregators/dbpedia.cjs — DBpedia structured-knowledge adapter.
 *
 * Endpoints (verified 2026-10-05):
 *   1. Lookup API: https://lookup.dbpedia.org/api/search?query=<q>&format=json
 *      (returned empty/unreachable during verification — treated as down)
 *   2. SPARQL fallback: https://dbpedia.org/sparql with an rdfs:label
 *      bif:contains query, bounded with LIMIT. Virtuoso requires the search
 *      term wrapped in single quotes inside bif:contains, e.g.
 *      ?label bif:contains "'Eiffel Tower'".
 * Returns entity label / description (rdfs:comment) / DBpedia URI.
 * Never scrapes rendered DBpedia pages. DBpedia data is CC-BY-SA-3.0 / GFDL.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'dbpedia',
  name: 'DBpedia',
  category: 'knowledge',
  transport: 'api',
  baseUrl: 'https://www.dbpedia.org',
  docsUrl: 'https://www.dbpedia.org/resources/sparql/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: true,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 2,
  description: 'DBpedia structured knowledge via the Lookup API with a bounded SPARQL (rdfs:label bif:contains) fallback on dbpedia.org/sparql. Returns entity labels, English descriptions and DBpedia URIs. Data licensed CC-BY-SA-3.0 / GFDL-1.3 (see metadata).',
};

const LOOKUP_API = 'https://lookup.dbpedia.org/api/search';
const SPARQL_API = 'https://dbpedia.org/sparql';
const DATA_LICENSE = 'CC-BY-SA-3.0 / GFDL-1.3';

function sparqlEscape(term) {
  // bif:contains needs single-quoted terms; escape embedded quotes.
  return String(term).replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim();
}

class DBpediaSource extends BaseKnowledgeSource {
  _mapLookup(doc) {
    const uris = Array.isArray(doc.resource) ? doc.resource : [];
    const uri = uris[0] || null;
    return {
      id: uri ? `dbpedia:${uri}` : null,
      sourceId: uri,
      sourceUrl: uri,
      title: doc.label || null,
      description: doc.description || null,
      type: 'entity',
      creator: null,
      date: null,
      language: 'en',
      country: null,
      contentUrl: uri,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: 'https://www.dbpedia.org/',
      rights: 'unknown',
      identifiers: { dbpedia: uri },
      tags: [],
      categories: Array.isArray(doc.categories) ? doc.categories.map((c) => String(c.label || c)).filter(Boolean).slice(0, 8) : [],
      coordinates: { lat: null, lon: null },
      metadata: { dataLicense: DATA_LICENSE, source: 'dbpedia-lookup', refCount: doc.refCount != null ? doc.refCount : null },
    };
  }

  async _searchLookup(q, limit) {
    const url = this._buildUrl(LOOKUP_API, { query: q, format: 'json', maxResults: limit });
    // Lookup has been unresponsive/down (verified 2026-10-05): keep the
    // timeout tight and retries off so the SPARQL fallback engages quickly.
    const data = await this.getJson(url, { timeoutMs: 12000, maxRetries: 0 });
    const docs = data && Array.isArray(data.docs) ? data.docs : [];
    return docs.slice(0, limit).map((d) => this._mapLookup(d));
  }

  _mapSparql(b) {
    const uri = b.s && b.s.value ? b.s.value : null;
    return {
      id: uri ? `dbpedia:${uri}` : null,
      sourceId: uri,
      sourceUrl: uri,
      title: b.label && b.label.value ? b.label.value : null,
      description: b.desc && b.desc.value ? b.desc.value : null,
      type: 'entity',
      creator: null,
      date: null,
      language: 'en',
      country: null,
      contentUrl: uri,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: 'https://www.dbpedia.org/',
      rights: 'unknown',
      identifiers: { dbpedia: uri },
      tags: [],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: { dataLicense: DATA_LICENSE, source: 'dbpedia-sparql' },
    };
  }

  async _searchSparql(q, limit) {
    const term = sparqlEscape(q);
    if (!term) return [];
    const query = `SELECT DISTINCT ?s ?label ?desc WHERE { ` +
      `?s rdfs:label ?label . ` +
      `OPTIONAL { ?s rdfs:comment ?desc . FILTER (lang(?desc) = "en") } ` +
      `?label bif:contains "'${term}'" . ` +
      `FILTER (lang(?label) = "en") } LIMIT ${limit}`;
    const url = this._buildUrl(SPARQL_API, { query, format: 'json' });
    const data = await this.getJson(url);
    const bindings = data && data.results && Array.isArray(data.results.bindings)
      ? data.results.bindings : [];
    return bindings.map((b) => this._mapSparql(b));
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    try {
      const lookup = await this._searchLookup(q, limit);
      if (lookup.length) return this.normalizeMany(lookup);
    } catch (_) { /* lookup down — fall through to SPARQL */ }
    const sparql = await this._searchSparql(q, limit);
    return this.normalizeMany(sparql);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(LOOKUP_API, { query: 'test', format: 'json', maxResults: 1 }), { timeoutMs: 12000, maxRetries: 0 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'lookup probe succeeded' };
    } catch (_) { /* try SPARQL */ }
    try {
      await this.getJson(this._buildUrl(SPARQL_API, {
        query: 'ASK { ?s ?p ?o }', format: 'json',
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'lookup unavailable; SPARQL fallback probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new DBpediaSource(deps, meta);
}

module.exports = { meta, createSource };
