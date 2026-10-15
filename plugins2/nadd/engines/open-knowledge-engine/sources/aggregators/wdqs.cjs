/*
 * sources/aggregators/wdqs.cjs — Wikidata Query Service (SPARQL) adapter.
 *
 * Structured queries ONLY — never fuzzy regex search.
 * Endpoint from env WIKIDATA_SPARQL_ENDPOINT (default
 * https://query.wikidata.org/sparql).
 *
 * search() works in two steps:
 *   1. Resolve the query to up to 3 candidate QIDs via the Wikidata
 *      wbsearchentities action API (label/description search — the same
 *      route the wikidata adapter uses).
 *   2. Run ONE small SPARQL query with VALUES listing those QIDs to fetch
 *      key facts: label, instance of (P31), country (P17), inception (P571)
 *      and coordinates (P625).
 * GET with ?query=<url-encoded>&format=json.
 *
 * NOTE (2026-2027 backend migration): the Wikidata Query Service is
 * undergoing a backend migration, so the endpoint is configurable via
 * WIKIDATA_SPARQL_ENDPOINT to allow pointing at a replacement SPARQL
 * service (e.g. a mirror or the query-main service) without code changes.
 * Wikidata data is CC0-1.0.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wdqs',
  name: 'Wikidata Query Service',
  category: 'knowledge',
  transport: 'api',
  baseUrl: 'https://query.wikidata.org',
  docsUrl: 'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: ['WIKIDATA_SPARQL_ENDPOINT'],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: true,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 2,
  description: 'Wikidata structured knowledge via the Query Service SPARQL endpoint (configurable through WIKIDATA_SPARQL_ENDPOINT). search() resolves the query to QIDs with wbsearchentities, then runs one small bounded SPARQL VALUES query for key facts (instance of, country, inception, coordinates). Structured queries only, never fuzzy text search. NOTE: the WDQS backend is being migrated through 2026-2027; set WIKIDATA_SPARQL_ENDPOINT if the default endpoint changes. Data is CC0-1.0.',
};

const ENTITY_API = 'https://www.wikidata.org/w/api.php';

function endpoint() {
  const e = process.env.WIKIDATA_SPARQL_ENDPOINT;
  return (e && e.trim()) || 'https://query.wikidata.org/sparql';
}

function lit(binding) {
  return binding && binding.value != null ? String(binding.value) : null;
}

function qidFromUri(uri) {
  const m = String(uri || '').match(/\/entity\/(Q\d+)$/);
  return m ? m[1] : null;
}

function parseWktPoint(wkt) {
  // "Point(lon lat)" -> {lat, lon}; null when unparseable — never fabricated.
  const m = String(wkt || '').match(/Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!m) return { lat: null, lon: null };
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { lat: null, lon: null };
}

class WdqsSource extends BaseKnowledgeSource {
  async _resolveQids(q, limit, lang) {
    const url = this._buildUrl(ENTITY_API, {
      action: 'wbsearchentities', search: q, language: lang,
      limit, format: 'json', formatversion: 2,
    });
    const data = await this.getJson(url);
    const hits = data && Array.isArray(data.search) ? data.search : [];
    return hits
      .map((h) => ({ qid: h.id || null, label: h.label || null, description: h.description || null }))
      .filter((h) => h.qid && /^Q\d+$/.test(h.qid));
  }

  async _sparqlFacts(qids, lang) {
    const values = qids.map((h) => `wd:${h.qid}`).join(' ');
    const query = `SELECT ?item ?itemLabel ?instanceLabel ?countryLabel ?inception ?coord WHERE { ` +
      `VALUES ?item { ${values} } ` +
      `OPTIONAL { ?item wdt:P31 ?instance . } ` +
      `OPTIONAL { ?item wdt:P17 ?country . } ` +
      `OPTIONAL { ?item wdt:P571 ?inception . } ` +
      `OPTIONAL { ?item wdt:P625 ?coord . } ` +
      `SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". } }`;
    const url = this._buildUrl(endpoint(), { query, format: 'json' });
    const data = await this.getJson(url);
    const bindings = data && data.results && Array.isArray(data.results.bindings)
      ? data.results.bindings : [];
    const byQid = new Map();
    for (const b of bindings) {
      const qid = qidFromUri(lit(b.item));
      if (qid && !byQid.has(qid)) byQid.set(qid, b);
    }
    return byQid;
  }

  _mapHit(hit, fact) {
    const coord = parseWktPoint(fact && lit(fact.coord));
    return {
      id: `wdqs:${hit.qid}`,
      sourceId: hit.qid,
      sourceUrl: `https://www.wikidata.org/wiki/${hit.qid}`,
      title: (fact && lit(fact.itemLabel)) || hit.label || hit.qid,
      description: hit.description || null,
      type: 'entity',
      creator: null,
      date: fact && lit(fact.inception) ? lit(fact.inception).slice(0, 10) : null,
      language: null,
      country: fact ? lit(fact.countryLabel) : null,
      contentUrl: `https://www.wikidata.org/wiki/${hit.qid}`,
      thumbnailUrl: null,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      rights: 'unknown',
      identifiers: { wikidata: hit.qid, concepturi: `http://www.wikidata.org/entity/${hit.qid}` },
      tags: [],
      categories: [],
      coordinates: coord,
      metadata: {
        instanceOf: fact ? lit(fact.instanceLabel) : null,
        inception: fact ? lit(fact.inception) : null,
        sparqlEndpoint: endpoint(),
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const lang = String(options.lang || 'en').toLowerCase().slice(0, 8) || 'en';
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const nQids = Math.min(3, limit);
    const hits = await this._resolveQids(q, nQids, lang);
    if (!hits.length) return [];
    let facts = new Map();
    try {
      facts = await this._sparqlFacts(hits, lang);
    } catch (_) {
      // SPARQL down (e.g. during the 2026-2027 backend migration): fall back
      // to the wbsearchentities label/description data — honest, no fabrication.
    }
    return this.normalizeMany(hits.map((h) => this._mapHit(h, facts.get(h.qid))));
  }

  async healthCheck() {
    const t0 = Date.now();
    const ep = endpoint();
    try {
      await this.getJson(this._buildUrl(ep, {
        query: 'ASK { ?s ?p ?o }', format: 'json',
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: `SPARQL probe succeeded (${ep})` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: `SPARQL probe failed (${ep}): ${String(err.message).slice(0, 150)}` };
    }
  }
}

function createSource(deps) {
  return new WdqsSource(deps, meta);
}

module.exports = { meta, createSource };
