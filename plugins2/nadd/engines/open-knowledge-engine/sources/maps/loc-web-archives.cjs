/*
 * sources/maps/loc-web-archives.cjs — Library of Congress Web Archives adapter.
 *
 * Endpoint (verified 2026-10-05):
 *   https://www.loc.gov/web-archives/?q=<q>&fo=json
 *
 * Returns a JSON document whose content.results[] entries carry
 * access_restricted, aka (alternate links incl. item URLs), date/dates,
 * description, and (for some records) titles. This is a curated archive
 * collection index — 'limited' status reflects partial field coverage, not
 * missing search. METADATA ONLY: archived captures are never downloaded.
 * Dates/creators come from the record or null (§75 NO FABRICATION).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'loc-web-archives',
  name: 'Library of Congress Web Archives',
  category: 'web_archive',
  transport: 'api',
  baseUrl: 'https://www.loc.gov/web-archives/',
  docsUrl: 'https://www.loc.gov/apis/',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxResults: 20 },
  priority: 4,
  description: 'Library of Congress Web Archives via the loc.gov JSON API (q + fo=json). Limited: curated archive-collection index with partial field coverage (dates/descriptions where cataloged). Metadata-only — captures are never downloaded.',
};

const SEARCH_URL = 'https://www.loc.gov/web-archives/';

function firstString(v) {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
  }
  return null;
}

class LocWebArchivesSource extends BaseKnowledgeSource {
  _mapHit(hit) {
    const itemUrl = firstString(hit.id) || firstString(hit.aka);
    const title = firstString(hit.title) || firstString(hit.item && hit.item.title)
      || (itemUrl ? itemUrl.split('/').filter(Boolean).pop() : null);
    return {
      id: `loc-web-archives:${hit.id || itemUrl || title}`,
      sourceId: hit.id != null ? String(hit.id) : null,
      sourceUrl: itemUrl,
      title,
      description: firstString(hit.description),
      type: 'web_archive',
      creator: firstString(hit.contributor) || firstString(hit.creator),
      date: firstString(hit.date),
      language: firstString(hit.language),
      country: null,
      contentUrl: itemUrl,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { loc_item_id: hit.id != null ? String(hit.id) : null, loc_aka: Array.isArray(hit.aka) ? hit.aka : null },
      tags: ['loc', 'web-archive'],
      categories: Array.isArray(hit.subject) ? hit.subject.filter((s) => typeof s === 'string') : [],
      coordinates: { lat: null, lon: null },
      metadata: {
        accessRestricted: hit.access_restricted === true,
        dates: Array.isArray(hit.dates) ? hit.dates : null,
        campaigns: Array.isArray(hit.campaigns) ? hit.campaigns : null,
        url: firstString(hit.url),
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(SEARCH_URL, { q, fo: 'json', c: limit });
    const data = await this.getJson(url);
    const hits = Array.isArray(data && data.content && data.content.results) ? data.content.results : [];
    return this.normalizeMany(hits.slice(0, limit).map((h) => this._mapHit(h)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl(SEARCH_URL, { q: 'test', fo: 'json', c: 1 }));
      const hits = data && data.content && data.content.results;
      return {
        id: this.id,
        status: Array.isArray(hits) ? 'ok' : 'limited',
        latencyMs: Date.now() - t0,
        detail: Array.isArray(hits) ? 'loc.gov web-archives JSON probe succeeded' : 'loc.gov probe returned an unexpected payload shape',
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new LocWebArchivesSource(deps, meta);
}

module.exports = { meta, createSource };
