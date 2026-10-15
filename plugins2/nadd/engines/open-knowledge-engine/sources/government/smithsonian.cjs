/*
 * sources/government/smithsonian.cjs — Smithsonian Institution Open Access.
 *
 * Endpoint: GET https://api.si.edu/openaccess/api/v1.0/search?q=<q>&api_key=<key>&start=0&rows=<n>
 * Response: { response: { rowCount, rows: [ { id, title, url,
 *   content: { descriptiveNonRepeating: { title: { content }, record_link,
 *     guid, unit_code, data_source, notes }, freetext: { name: [{ content }],
 *     date: [{ content }], topic: [...], ... } } }, ... ] } }
 *
 * An API key is REQUIRED (SMITHSONIAN_API_KEY). Without it this adapter
 * reports status 'auth_required' and search() returns []. Response shape
 * follows the Smithsonian Open Access API documentation; no live probe was
 * possible from this environment.
 *
 * docs: https://www.si.edu/openaccess/devtools
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  const v = process.env.SMITHSONIAN_API_KEY;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function freetextValues(ft, field) {
  if (!ft || !Array.isArray(ft[field])) return [];
  return ft[field].map((x) => firstStr(x && x.content)).filter(Boolean);
}

const meta = {
  id: 'smithsonian',
  name: 'Smithsonian Institution Open Access',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://api.si.edu',
  docsUrl: 'https://www.si.edu/openaccess/devtools',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['SMITHSONIAN_API_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    images: true,
    documents: false,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 7,
  description: 'Smithsonian collections via the Open Access search API ' +
    '(GET /openaccess/api/v1.0/search?q=&api_key=&rows=). API key REQUIRED: ' +
    'without SMITHSONIAN_API_KEY status is auth_required and search returns ' +
    '[]. Maps descriptiveNonRepeating title/record_link and freetext ' +
    'name/date/topic fields. License kept as unknown.',
};

class SmithsonianSource extends BaseKnowledgeSource {
  _mapRow(row) {
    row = row || {};
    const content = (row.content && typeof row.content === 'object') ? row.content : {};
    const dnr = (content.descriptiveNonRepeating && typeof content.descriptiveNonRepeating === 'object')
      ? content.descriptiveNonRepeating : {};
    const ft = (content.freetext && typeof content.freetext === 'object') ? content.freetext : {};
    const dnrTitle = dnr.title && typeof dnr.title === 'object' ? firstStr(dnr.title.content) : firstStr(dnr.title);
    const names = freetextValues(ft, 'name');
    const dates = freetextValues(ft, 'date');
    const topics = freetextValues(ft, 'topic');
    return {
      id: firstStr(row.id),
      sourceId: firstStr(row.id),
      sourceUrl: firstStr(dnr.record_link) || firstStr(dnr.guid) || firstStr(row.url),
      title: dnrTitle || firstStr(row.title),
      description: firstStr(dnr.notes),
      type: 'object',
      creator: names.length ? names[0] : null,
      date: dates.length ? dates[0] : null,
      thumbnailUrl: firstStr(dnr.online_media && dnr.online_media.thumbnail),
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        smithsonianId: firstStr(row.id),
        guid: firstStr(dnr.guid),
        unitCode: firstStr(dnr.unit_code),
        dataSource: firstStr(dnr.data_source),
      },
      tags: topics,
      metadata: {
        unitCode: firstStr(dnr.unit_code),
        names: names,
        dataSource: firstStr(dnr.data_source),
      },
    };
  }

  async search(query, options) {
    const key = readKey();
    if (!key) return [];
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://api.si.edu/openaccess/api/v1.0/search', {
      q: String(query).trim(),
      api_key: key,
      start: 0,
      rows: limit,
    });
    const data = await this.getJson(url);
    const rows = (data && data.response && Array.isArray(data.response.rows)) ? data.response.rows : [];
    return this.normalizeMany(rows.slice(0, limit).map((r) => this._mapRow(r)));
  }

  async healthCheck() {
    const key = readKey();
    if (!key) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'SMITHSONIAN_API_KEY not set; the Smithsonian Open Access API requires an API key' };
    }
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://api.si.edu/openaccess/api/v1.0/search', { q: 'test', api_key: key, start: 0, rows: 1 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Smithsonian Open Access search API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new SmithsonianSource(deps, meta);
}

module.exports = { meta, createSource };
