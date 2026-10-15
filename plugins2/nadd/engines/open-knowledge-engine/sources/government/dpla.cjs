/*
 * sources/government/dpla.cjs — Digital Public Library of America (DPLA).
 *
 * Endpoint: GET https://api.dp.la/v2/items?q=<q>&api_key=<key>&page_size=<n>
 * Response: { count, docs: [ { id, sourceResource: { title, description,
 *   creator, date: { displayDate }, rights, type, language, spatial },
 *   isShownAt, object, dataProvider, provider }, ... ] }
 *
 * An API key is REQUIRED (DPLA_KEY). Without it this adapter reports status
 * 'auth_required' and search() returns []. Response shape follows the DPLA
 * API documentation; no live keyless probe was possible from this
 * environment.
 *
 * docs: https://pro.dp.la/developers
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  const v = process.env.DPLA_KEY;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const meta = {
  id: 'dpla',
  name: 'Digital Public Library of America',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://api.dp.la',
  docsUrl: 'https://pro.dp.la/developers',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['DPLA_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    images: true,
    documents: true,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 6,
  description: 'DPLA aggregation of US libraries, archives and museums via ' +
    'the v2 items API (GET /v2/items?q=&api_key=&page_size=). API key ' +
    'REQUIRED: without DPLA_KEY status is auth_required and search returns ' +
    '[]. Maps title, sourceResource metadata, isShownAt URL and object ' +
    'thumbnail. License echoed from source rights, never fabricated.',
};

class DplaSource extends BaseKnowledgeSource {
  _mapDoc(doc) {
    doc = doc || {};
    const sr = (doc.sourceResource && typeof doc.sourceResource === 'object') ? doc.sourceResource : {};
    const dateObj = (sr.date && typeof sr.date === 'object') ? sr.date : {};
    return {
      id: firstStr(doc.id),
      sourceId: firstStr(doc.id),
      sourceUrl: firstStr(doc.isShownAt),
      title: firstStr(sr.title),
      description: firstStr(sr.description),
      type: firstStr(sr.type),
      creator: firstStr(sr.creator),
      date: firstStr(dateObj.displayDate),
      language: firstStr(sr.language),
      thumbnailUrl: firstStr(doc.object),
      license: sr.rights != null ? sr.rights : 'unknown',
      rights: firstStr(sr.rights) || 'unknown',
      identifiers: { dplaId: firstStr(doc.id) },
      metadata: {
        dataProvider: firstStr(doc.dataProvider),
        provider: firstStr(doc.provider && doc.provider.name),
        spatial: Array.isArray(sr.spatial) ? sr.spatial.map(firstStr).filter(Boolean) : [],
        subject: Array.isArray(sr.subject) ? sr.subject.map((x) => firstStr(x && x.name) || firstStr(x)).filter(Boolean) : [],
      },
    };
  }

  async search(query, options) {
    const key = readKey();
    if (!key) return [];
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://api.dp.la/v2/items', {
      q: String(query).trim(),
      api_key: key,
      page_size: limit,
      page: 1,
    });
    const data = await this.getJson(url);
    const docs = (data && Array.isArray(data.docs)) ? data.docs : [];
    return this.normalizeMany(docs.slice(0, limit).map((d) => this._mapDoc(d)));
  }

  async healthCheck() {
    const key = readKey();
    if (!key) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'DPLA_KEY not set; the DPLA v2 API requires an API key' };
    }
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://api.dp.la/v2/items', { q: 'test', api_key: key, page_size: 1, page: 1 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'DPLA v2 items API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new DplaSource(deps, meta);
}

module.exports = { meta, createSource };
