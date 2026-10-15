/*
 * sources/aggregators/opencorporates.cjs — OpenCorporates company search adapter.
 *
 * Endpoint (verified 2026-10-05 — live, but requires a token):
 *   https://api.opencorporates.com/v0.4/companies/search?q=<q>&per_page=20
 *     [&api_token=<OPENCORPORATES_TOKEN>]
 *
 * A free token (register at opencorporates.com) is optional but strongly
 * recommended: anonymous calls currently return
 * {"error":{"message":"Invalid Api Token. Please check your OpenCorporates
 * account"}}, so the adapter is marked 'limited' and search() returns []
 * when the API refuses the request — never fabricated companies.
 * Respect OpenCorporates usage rules: search only, no bulk extraction.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'opencorporates',
  name: 'OpenCorporates',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://api.opencorporates.com/v0.4',
  docsUrl: 'https://api.opencorporates.com/documentation/API-Reference',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: ['OPENCORPORATES_TOKEN'],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: false,
    license: false, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 4,
  description: 'OpenCorporates company registry search (name, number, jurisdiction, type, incorporation/dissolution dates, registered address). Optional free api_token via OPENCORPORATES_TOKEN raises rate limits; the API currently refuses unauthenticated search, so without a token the adapter stays limited and returns [] rather than inventing companies. Search only — no bulk extraction per OpenCorporates usage rules.',
};

const API = 'https://api.opencorporates.com/v0.4/companies/search';

class OpenCorporatesSource extends BaseKnowledgeSource {
  _mapCompany(c) {
    const id = [c.jurisdiction_code, c.company_number].filter(Boolean).join('/');
    return {
      id: id ? `opencorporates:${id}` : null,
      sourceId: id || null,
      sourceUrl: c.opencorporates_url || null,
      title: c.name || null,
      description: [c.company_type, c.jurisdiction_code].filter(Boolean).join(' · ') || null,
      type: 'company',
      creator: null,
      date: c.incorporation_date || null,
      updatedAt: c.updated_at || null,
      language: null,
      country: c.jurisdiction_code ? String(c.jurisdiction_code).split('_')[0].toUpperCase() : null,
      contentUrl: c.opencorporates_url || null,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: 'https://opencorporates.com/terms/',
      rights: 'unknown',
      identifiers: {
        opencorporates: id || null,
        company_number: c.company_number || null,
        jurisdiction_code: c.jurisdiction_code || null,
        registry_url: c.registry_url || null,
      },
      tags: [],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: {
        companyType: c.company_type || null,
        incorporationDate: c.incorporation_date || null,
        dissolutionDate: c.dissolution_date || null,
        inactive: c.inactive != null ? Boolean(c.inactive) : null,
        registeredAddress: c.registered_address_in_full || null,
        agentName: c.agent_name || null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const token = process.env.OPENCORPORATES_TOKEN;
    const url = this._buildUrl(API, {
      q, per_page: limit,
      api_token: token && token.trim() ? token.trim() : undefined,
    });
    let data;
    try {
      data = await this.getJson(url);
    } catch (_) {
      return []; // network / rate-limit / refused — honest empty, never invented
    }
    if (!data || data.error) return [];
    const rows = data.results && Array.isArray(data.results.companies)
      ? data.results.companies : [];
    const companies = rows
      .map((r) => (r && r.company ? r.company : null))
      .filter(Boolean);
    return this.normalizeMany(companies.map((c) => this._mapCompany(c)));
  }

  async healthCheck() {
    const t0 = Date.now();
    const token = process.env.OPENCORPORATES_TOKEN;
    const url = this._buildUrl(API, {
      q: 'test', per_page: 1,
      api_token: token && token.trim() ? token.trim() : undefined,
    });
    try {
      const data = await this.getJson(url);
      if (data && data.error) {
        return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: `API refused request: ${String(data.error.message || 'unknown').slice(0, 120)} — free token recommended` };
      }
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'companies/search probe succeeded' };
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/HTTP 40[13]/.test(msg)) {
        return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: 'API refused unauthenticated request (401/403) — free token via OPENCORPORATES_TOKEN recommended' };
      }
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: msg.slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new OpenCorporatesSource(deps, meta);
}

module.exports = { meta, createSource };
