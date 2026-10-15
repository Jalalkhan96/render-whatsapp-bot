/*
 * sources/wiki/wikisource.cjs — Wikisource (multilingual source library).
 *
 * NOTE: https://www.wikisource.org 301-redirects to https://wikisource.org
 * (verified 2026-10-05), so the base API host is wikisource.org.
 * Endpoint: action=query&list=search on that host.
 * Wikisource hosts a mix of public-domain and CC-licensed texts, so the
 * license field is left 'unknown' rather than asserted (§75 no fabrication).
 * fullText capability is true: whole source texts are available via getItem.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikisource',
  name: 'Wikisource',
  category: 'wiki',
  transport: 'api',
  baseUrl: 'https://wikisource.org',
  docsUrl: 'https://www.mediawiki.org/wiki/API:Main_page',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: true, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 200, maxPages: 5, maxResults: 20 },
  priority: 2,
  description: 'Wikisource free source-text library via the MediaWiki action API (multilingual portal at wikisource.org); full-text search of source documents with stripped snippets. Mixed PD/CC content — license stays unknown.',
};

const API = 'https://wikisource.org/w/api.php';

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

class WikisourceSource extends BaseKnowledgeSource {
  _mapHit(hit, totalHits) {
    const pageUrl = `https://wikisource.org/wiki/${encodeURIComponent(hit.title)}`;
    return {
      id: `wikisource:${hit.pageid}`,
      sourceId: String(hit.pageid),
      sourceUrl: pageUrl,
      title: hit.title || null,
      description: stripHtml(hit.snippet),
      type: 'source',
      creator: null,
      date: hit.timestamp || null,
      language: null,
      country: null,
      contentUrl: pageUrl,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { wikisource_pageid: hit.pageid },
      tags: ['wikisource'],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: {
        namespace: hit.ns != null ? hit.ns : null,
        pageSize: hit.size != null ? hit.size : null,
        wordCount: hit.wordcount != null ? hit.wordcount : null,
        totalHits: typeof totalHits === 'number' ? totalHits : null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(API, {
      action: 'query',
      list: 'search',
      srsearch: q,
      srlimit: limit,
      srnamespace: 0,
      srinfo: 'totalhits',
      srprop: 'snippet|titlesnippet|size|wordcount|timestamp',
      format: 'json',
      formatversion: 2,
    });
    const data = await this.getJson(url);
    const queryData = (data && data.query) || {};
    const hits = Array.isArray(queryData.search) ? queryData.search : [];
    const totalHits = queryData.searchinfo && typeof queryData.searchinfo.totalhits === 'number'
      ? queryData.searchinfo.totalhits : null;
    return this.normalizeMany(hits.map((h) => this._mapHit(h, totalHits)));
  }

  async getItem(id, options) {
    options = options || {};
    const raw = String(id || '').trim();
    if (!raw) return null;
    const pageid = /^\d+$/.test(raw) ? raw : null;
    const url = this._buildUrl(API, {
      action: 'query',
      prop: 'extracts|info',
      explaintext: 1,
      inprop: 'url',
      format: 'json',
      formatversion: 2,
      ...(pageid ? { pageids: pageid } : { titles: raw }),
    });
    const data = await this.getJson(url);
    const pages = (data && data.query && data.query.pages) || [];
    const page = pages.find((p) => !p.missing && !p.invalid);
    if (!page) return null;
    return this.normalize({
      id: `wikisource:${page.pageid}`,
      sourceId: String(page.pageid),
      sourceUrl: page.fullurl || null,
      title: page.title || null,
      description: page.extract && page.extract.trim() !== '' ? page.extract.trim() : null,
      type: 'source',
      contentUrl: page.fullurl || null,
      license: 'unknown',
      identifiers: { wikisource_pageid: page.pageid },
      metadata: { fullTextAvailable: true },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API, {
        action: 'query', list: 'search', srsearch: 'test', srlimit: 1,
        format: 'json', formatversion: 2,
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Wikisource search probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new WikisourceSource(deps, meta);
}

module.exports = { meta, createSource };
