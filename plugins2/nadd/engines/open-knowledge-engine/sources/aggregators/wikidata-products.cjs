/*
 * sources/aggregators/wikidata-products.cjs — Wikidata products (SPARQL) adapter.
 *
 * LIMITED BY DESIGN. Wikidata has no dedicated product-catalogue API, so
 * this adapter takes the honest minimal route:
 *   1. Resolve the query to up to 2 candidate QIDs via the Wikidata
 *      wbsearchentities action API (label/description search).
 *   2. Run ONE small, structured SPARQL query that surfaces the candidates'
 *      direct claims generically (?prop wikibase:directClaim ?p with the
 *      label service) — never fuzzy regex search, and no hardcoded
 *      property-ID guessing. Claims whose property label mentions
 *      GTIN / EAN / UPC / barcode / ISBN are surfaced as identifiers;
 *      everything else lands in metadata as reported.
 * GET with ?query=<url-encoded>&format=json.
 *
 * SPARQL endpoint is configurable via WIKIDATA_SPARQL_ENDPOINT
 * (same convention as the wdqs adapter; see its 2026-2027 backend
 * migration note). Data is CC0-1.0. Claims are passed through as
 * reported — never invented.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikidata-products',
  name: 'Wikidata Products',
  category: 'product',
  transport: 'api',
  baseUrl: 'https://query.wikidata.org',
  docsUrl: 'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: ['WIKIDATA_SPARQL_ENDPOINT'],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: false,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 5,
  description: 'LIMITED: surfaces Wikidata entities matching product-ish queries with their direct claims via one small structured SPARQL query (generic claim surfacing, no fuzzy search). Product identifier claims (GTIN/EAN/UPC/barcode/ISBN, matched by property label) are extracted as identifiers; other claims land in metadata as reported. Not a dedicated product catalogue — for barcoded consumer products prefer Open Food/Beauty/Products Facts. Data is CC0-1.0.',
};

const ENTITY_API = 'https://www.wikidata.org/w/api.php';
const IDENTIFIER_PROP_RE = /gtin|ean|upc|barcode|isbn|mpn\b|model number/i;

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

class WikidataProductsSource extends BaseKnowledgeSource {
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

  async _sparqlClaims(qids, lang) {
    const values = qids.map((h) => `wd:${h.qid}`).join(' ');
    const query = `SELECT ?item ?itemLabel ?propLabel ?value WHERE { ` +
      `VALUES ?item { ${values} } ` +
      `?prop wikibase:directClaim ?p . ` +
      `?item ?p ?value . ` +
      `SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". } } ` +
      `LIMIT 120`;
    const url = this._buildUrl(endpoint(), { query, format: 'json' });
    const data = await this.getJson(url);
    const bindings = data && data.results && Array.isArray(data.results.bindings)
      ? data.results.bindings : [];
    const byQid = new Map();
    for (const b of bindings) {
      const qid = qidFromUri(lit(b.item));
      if (!qid) continue;
      if (!byQid.has(qid)) byQid.set(qid, { label: lit(b.itemLabel), claims: [] });
      const row = byQid.get(qid);
      if (row.claims.length < 24) {
        row.claims.push({ property: lit(b.propLabel), value: lit(b.value) });
      }
    }
    return byQid;
  }

  _mapHit(hit, row) {
    const identifiers = { wikidata: hit.qid };
    const claimMeta = [];
    if (row) {
      for (const c of row.claims) {
        if (c.property && IDENTIFIER_PROP_RE.test(c.property) && c.value) {
          const key = c.property.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'identifier';
          if (!(key in identifiers)) identifiers[key] = c.value;
        } else if (c.property && c.value) {
          if (claimMeta.length < 12) claimMeta.push({ property: c.property, value: c.value });
        }
      }
    }
    return {
      id: `wikidata-products:${hit.qid}`,
      sourceId: hit.qid,
      sourceUrl: `https://www.wikidata.org/wiki/${hit.qid}`,
      title: (row && row.label) || hit.label || hit.qid,
      description: hit.description || null,
      type: 'product',
      creator: null,
      date: null,
      language: null,
      country: null,
      contentUrl: `https://www.wikidata.org/wiki/${hit.qid}`,
      thumbnailUrl: null,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      rights: 'unknown',
      identifiers,
      tags: [],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: {
        claims: claimMeta,
        claimCount: row ? row.claims.length : null,
        note: 'Limited adapter: generic Wikidata claims for product-ish entities; prefer Open*Facts for barcoded consumer products.',
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const lang = String(options.lang || 'en').toLowerCase().slice(0, 8) || 'en';
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const hits = await this._resolveQids(q, Math.min(2, limit), lang);
    if (!hits.length) return [];
    let rows = new Map();
    try {
      rows = await this._sparqlClaims(hits, lang);
    } catch (_) {
      // SPARQL unavailable (e.g. backend migration): fall back to
      // label/description data from wbsearchentities — honest, no fabrication.
    }
    return this.normalizeMany(hits.map((h) => this._mapHit(h, rows.get(h.qid))));
  }

  async healthCheck() {
    const t0 = Date.now();
    const ep = endpoint();
    try {
      await this.getJson(this._buildUrl(ep, { query: 'ASK { ?s ?p ?o }', format: 'json' }));
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: `SPARQL probe succeeded (${ep}); limited adapter by design` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: `SPARQL probe failed (${ep}): ${String(err.message).slice(0, 150)}` };
    }
  }
}

function createSource(deps) {
  return new WikidataProductsSource(deps, meta);
}

module.exports = { meta, createSource };
