/*
 * sources/misc/bhl.cjs — Biodiversity Heritage Library (BHL) adapter (REAL).
 *
 * Official API v3: GET https://www.biodiversitylibrary.org/api3
 *   params: op=PublicationSearch, searchterm=<q>, page=1, apikey=<BHL_KEY>, format=json
 *   -> {Status:"ok", Result:[{PublicationID, Title, ...}]}
 * Requires a free key (env BHL_KEY, from https://www.biodiversitylibrary.org).
 * Keyless -> 'auth_required': search returns [] — never fabricated.
 * Verified 2026-10-05: keyless request returns {Status:"unauthorized",
 * ErrorMessage:"'' is an invalid or unauthorized API key."}.
 * Record URL: https://www.biodiversitylibrary.org/bibliography/<PublicationID>
 *             https://www.biodiversitylibrary.org/item/<ItemID>
 * License: the API returns no per-record rights statement, so license stays
 * 'unknown' (never assumed public domain, §38).
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');

const API_BASE = 'https://www.biodiversitylibrary.org/api3';

const meta = {
  id: 'bhl',
  name: 'Biodiversity Heritage Library',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://www.biodiversitylibrary.org',
  docsUrl: 'https://www.biodiversitylibrary.org/docs/api3.html',
  implemented: true,
  status: process.env.BHL_KEY ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['BHL_KEY'],
  capabilities: { search: true, metadata: true, images: false, documents: true, downloads: false, api: true, bulk: false, license: false, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 5,
  description: 'Biodiversity Heritage Library API v3: title/volume metadata search over natural-history literature. Needs a free key (BHL_KEY); ItemID links to https://www.biodiversitylibrary.org/item/<id>. No per-record rights in API responses — license reported unknown.',
};

class BHLSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
    this.apiKey = (deps && (deps.apiKey || deps.key)) || process.env.BHL_KEY || null;
  }

  _map(pub) {
    const id = pub.PublicationID != null ? String(pub.PublicationID)
      : (pub.ItemID != null ? String(pub.ItemID) : null);
    const title = noValue(pub.Title || pub.ShortTitle, null);
    const sourceUrl = pub.PublicationID != null
      ? `https://www.biodiversitylibrary.org/bibliography/${pub.PublicationID}`
      : (pub.ItemID != null ? `https://www.biodiversitylibrary.org/item/${pub.ItemID}` : null);
    return {
      id,
      sourceId: id,
      sourceUrl,
      title,
      description: noValue(pub.Notes || pub.PartUrl, null),
      type: 'book',
      creator: noValue(pub.Creator || pub.Author, null),
      date: noValue(pub.PublicationDate || pub.PublicationYear || pub.Year, null),
      language: noValue(pub.Language, null),
      country: noValue(pub.PublisherPlace, null),
      contentUrl: sourceUrl,
      identifiers: { objectId: id, publicationId: pub.PublicationID != null ? String(pub.PublicationID) : null },
      tags: ['biodiversity', 'natural-history'],
      metadata: {
        publisher: noValue(pub.PublisherName || pub.Publisher, null),
        publisherPlace: noValue(pub.PublisherPlace, null),
        callNumber: noValue(pub.CallNumber, null),
        doi: noValue(pub.DOI, null),
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    if (!this.apiKey) return []; // auth_required path: no key configured
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(API_BASE, {
      op: 'PublicationSearch',
      searchterm: String(query),
      page: 1,
      apikey: this.apiKey,
      format: 'json',
    });
    const data = await this.getJson(url);
    if (!data || data.Status !== 'ok' || !Array.isArray(data.Result)) return [];
    return this.normalizeMany(data.Result.slice(0, limit).map((p) => this._map(p)));
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'BHL_KEY not configured; search disabled' };
    }
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API_BASE, {
        op: 'PublicationSearch', searchterm: 'test', page: 1, apikey: this.apiKey, format: 'json',
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'BHL API v3 reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new BHLSource(deps, meta) };
