/*
 * sources/government/congress.cjs — U.S. Congress legislation (api.congress.gov).
 *
 * Endpoint: GET https://api.congress.gov/v3/bill?query=<q>&api_key=<key>[&limit=<n>]
 * Response: { bills: [ { congress, type, number, title, latestAction:
 *   { actionDate, text }, summary: { text }, url, updateDate }, ... ] }
 *
 * An API key is REQUIRED (get one at api.congress.gov). Without CONGRESS_KEY
 * this adapter reports status 'auth_required' and search() returns [].
 * Response shape follows the congress.gov v3 API documentation; no live
 * keyless probe was possible from this environment.
 *
 * docs: https://api.congress.gov
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

function firstStr(v) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readKey() {
  const v = process.env.CONGRESS_KEY;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function billUrl(b) {
  if (b && b.url && String(b.url).trim()) return String(b.url).trim();
  if (b && b.congress && b.type && b.number) {
    const typeSlug = String(b.type).toLowerCase().replace(/[^a-z]/g, '') || 'bill';
    return `https://www.congress.gov/bill/${b.congress}th-congress/${typeSlug}/${b.number}`;
  }
  return null;
}

const meta = {
  id: 'congress',
  name: 'U.S. Congress (congress.gov)',
  category: 'government',
  transport: 'api',
  baseUrl: 'https://api.congress.gov',
  docsUrl: 'https://api.congress.gov',
  implemented: true,
  status: 'auth_required',
  requiresKey: true,
  envKeys: ['CONGRESS_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    images: false,
    documents: true,
    api: true,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30 },
  priority: 6,
  description: 'Federal bills and legislation from the congress.gov v3 API ' +
    '(GET /v3/bill?query=&api_key=). API key REQUIRED: without CONGRESS_KEY ' +
    'status is auth_required and search returns []. Maps bill title, ' +
    'latestAction text/date and congress.gov URL. License kept as unknown.',
};

class CongressSource extends BaseKnowledgeSource {
  _mapBill(b) {
    b = b || {};
    const la = (b.latestAction && typeof b.latestAction === 'object') ? b.latestAction : {};
    const num = b.number != null ? String(b.number) : null;
    const id = (b.type && num && b.congress) ? `${b.type}${num}-${b.congress}` : null;
    return {
      id: id,
      sourceId: id,
      sourceUrl: billUrl(b),
      title: firstStr(b.title),
      description: firstStr(la.text) || firstStr(b.summary && b.summary.text),
      type: 'bill',
      date: firstStr(la.actionDate),
      updatedAt: firstStr(b.updateDate),
      country: 'United States',
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        congress: b.congress != null ? String(b.congress) : null,
        billType: firstStr(b.type),
        billNumber: num,
      },
      metadata: {
        latestAction: firstStr(la.text),
        latestActionDate: firstStr(la.actionDate),
        originChamber: firstStr(b.originChamber),
      },
    };
  }

  async search(query, options) {
    const key = readKey();
    if (!key) return [];
    if (!query || !String(query).trim()) return [];
    const limit = Math.max(1, Math.min(50, (options && options.limit) || 20));
    const url = this._buildUrl('https://api.congress.gov/v3/bill', {
      query: String(query).trim(),
      api_key: key,
      limit: limit,
      offset: 0,
    });
    const data = await this.getJson(url);
    const bills = (data && Array.isArray(data.bills)) ? data.bills : [];
    return this.normalizeMany(bills.slice(0, limit).map((b) => this._mapBill(b)));
  }

  async healthCheck() {
    const key = readKey();
    if (!key) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'CONGRESS_KEY not set; api.congress.gov requires an API key' };
    }
    const t0 = Date.now();
    try {
      const url = this._buildUrl('https://api.congress.gov/v3/bill', { query: 'test', api_key: key, limit: 1, offset: 0 });
      await this.getJson(url, { timeoutMs: 12000 });
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'congress.gov v3 bill search reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new CongressSource(deps, meta);
}

module.exports = { meta, createSource };
