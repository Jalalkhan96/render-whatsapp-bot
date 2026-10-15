/*
 * sources/wiki/wikidata.cjs — Wikidata (wbsearchentities action API) adapter.
 *
 * Endpoint (verified 2026-10-05):
 *   https://www.wikidata.org/w/api.php?action=wbsearchentities
 *     &search=<q>&language=en&format=json&formatversion=2
 * Search returns label/description/aliases only. getItem(id) fetches the full
 * entity JSON (Special:EntityData/<id>.json) to expose aliases and
 * coordinate claims (P625) — one request, never during bulk search.
 * Wikidata data is CC0-1.0.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikidata',
  name: 'Wikidata',
  category: 'wiki',
  transport: 'api',
  baseUrl: 'https://www.wikidata.org',
  docsUrl: 'https://www.wikidata.org/w/api.php',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: true,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 200, maxPages: 5, maxResults: 20 },
  priority: 1,
  description: 'Wikidata structured knowledge base via wbsearchentities; labels, descriptions and aliases mapped to entity QIDs. getItem fetches full entity JSON including P625 coordinate claims. Data is CC0-1.0.',
};

const ENTITY_API = 'https://www.wikidata.org/w/api.php';

function firstCoord(claims) {
  // Optional P625 extraction — never fabricated; null when absent.
  try {
    const c = claims && claims.P625 && claims.P625[0];
    const v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    if (v && Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude))) {
      return { lat: Number(v.latitude), lon: Number(v.longitude) };
    }
  } catch (_) { /* fall through to nulls */ }
  return { lat: null, lon: null };
}

class WikidataSource extends BaseKnowledgeSource {
  _mapEntity(e) {
    const qid = e.id || e.title || null;
    const aliases = Array.isArray(e.aliases)
      ? e.aliases.map((a) => (a && a.value) || a).filter((a) => typeof a === 'string').slice(0, 8)
      : [];
    return {
      id: qid ? `wikidata:${qid}` : null,
      sourceId: qid,
      sourceUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
      title: e.label || qid || null,
      description: e.description || null,
      type: 'entity',
      creator: null,
      date: null,
      language: (e.match && e.match.language) || null,
      country: null,
      contentUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
      thumbnailUrl: null,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      rights: 'unknown',
      identifiers: { wikidata: qid, concepturi: e.concepturi || null },
      tags: aliases,
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: { matchType: e.match && e.match.type ? e.match.type : null },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const lang = String(options.lang || 'en').toLowerCase().slice(0, 8) || 'en';
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(ENTITY_API, {
      action: 'wbsearchentities',
      search: q,
      language: lang,
      limit,
      format: 'json',
      formatversion: 2,
    });
    const data = await this.getJson(url);
    const hits = data && Array.isArray(data.search) ? data.search : [];
    return this.normalizeMany(hits.map((e) => this._mapEntity(e)));
  }

  async getItem(id, options) {
    options = options || {};
    const raw = String(id || '').trim();
    if (!raw) return null;
    const m = raw.match(/^Q(\d+)$/i);
    const qid = m ? `Q${m[1]}` : null;
    if (!qid) return null;
    const lang = String(options.lang || 'en').toLowerCase().slice(0, 8) || 'en';
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const data = await this.getJson(url);
    const entity = data && data.entities && data.entities[qid];
    if (!entity) return null;
    const label = (entity.labels && (entity.labels[lang] || entity.labels.en)) || null;
    const desc = (entity.descriptions && (entity.descriptions[lang] || entity.descriptions.en)) || null;
    const aliases = [];
    const al = entity.aliases && (entity.aliases[lang] || entity.aliases.en);
    if (Array.isArray(al)) {
      for (const a of al.slice(0, 8)) {
        if (a && a.value) aliases.push(a.value);
      }
    }
    return this.normalize({
      id: `wikidata:${qid}`,
      sourceId: qid,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      title: label && label.value ? label.value : qid,
      description: desc && desc.value ? desc.value : null,
      type: 'entity',
      language: lang,
      contentUrl: `https://www.wikidata.org/wiki/${qid}`,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      identifiers: { wikidata: qid, concepturi: `http://www.wikidata.org/entity/${qid}` },
      tags: aliases,
      coordinates: firstCoord(entity.claims),
      metadata: {
        instanceOf: (entity.claims && entity.claims.P31 && entity.claims.P31[0]
          && entity.claims.P31[0].mainsnak && entity.claims.P31[0].mainsnak.datavalue
          && entity.claims.P31[0].mainsnak.datavalue.value
          && entity.claims.P31[0].mainsnak.datavalue.value.id) || null,
      },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(ENTITY_API, {
        action: 'wbsearchentities', search: 'test', language: 'en', limit: 1,
        format: 'json', formatversion: 2,
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'wbsearchentities probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new WikidataSource(deps, meta);
}

module.exports = { meta, createSource };
