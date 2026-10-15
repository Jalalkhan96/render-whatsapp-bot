/*
 * sources/wiki/wikipedia.cjs — Wikipedia (MediaWiki action API) adapter.
 *
 * Endpoint (verified 2026-10-05):
 *   https://{lang}.wikipedia.org/w/api.php?action=query&list=search
 *     &srsearch=<q>&srlimit=<n>&format=json&formatversion=2
 * Snippets are HTML (searchmatch spans) and are stripped to plain text.
 * Article text is CC-BY-SA-4.0 site-wide (Wikimedia licensing policy).
 *
 * options.lang selects the language edition (default 'en'); options.limit
 * caps at 20 (meta.rateLimit.maxResults).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikipedia',
  name: 'Wikipedia',
  category: 'wiki',
  transport: 'api',
  baseUrl: 'https://en.wikipedia.org',
  docsUrl: 'https://www.mediawiki.org/wiki/API:Main_page',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: true, images: true, documents: false,
    downloads: false, api: true, bulk: false, coordinates: true,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 200, maxPages: 5, maxResults: 20 },
  priority: 1,
  description: 'Wikipedia free encyclopedia via the MediaWiki action API; full-text search of articles with stripped snippets. Use options.lang to query another language edition (e.g. ur, fr, es).',
};

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

function cleanLang(raw) {
  const l = String(raw || 'en').toLowerCase().trim();
  return /^[a-z][a-z0-9-]{0,11}$/.test(l) ? l : 'en';
}

class WikipediaSource extends BaseKnowledgeSource {
  _api(lang) {
    return `https://${lang}.wikipedia.org/w/api.php`;
  }

  _mapHit(hit, lang, totalHits) {
    const curidUrl = `https://${lang}.wikipedia.org/?curid=${hit.pageid}`;
    return {
      id: `wikipedia:${lang}:${hit.pageid}`,
      sourceId: String(hit.pageid),
      sourceUrl: curidUrl,
      title: hit.title || null,
      description: stripHtml(hit.snippet),
      type: 'article',
      creator: null,
      date: hit.timestamp || null,
      language: lang,
      country: null,
      contentUrl: curidUrl,
      thumbnailUrl: null,
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      rights: 'unknown',
      identifiers: { wikipedia_pageid: hit.pageid, wikipedia_edition: lang },
      tags: [`wikipedia-${lang}`],
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
    const lang = cleanLang(options.lang);
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(this._api(lang), {
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
    return this.normalizeMany(hits.map((h) => this._mapHit(h, lang, totalHits)));
  }

  async getItem(id, options) {
    options = options || {};
    const lang = cleanLang(options.lang);
    const raw = String(id || '').trim();
    if (!raw) return null;
    const pageid = /^\d+$/.test(raw) ? raw : null;
    const url = this._buildUrl(this._api(lang), {
      action: 'query',
      prop: 'extracts|info',
      exintro: 1,
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
      id: `wikipedia:${lang}:${page.pageid}`,
      sourceId: String(page.pageid),
      sourceUrl: page.fullurl || null,
      title: page.title || null,
      description: page.extract && page.extract.trim() !== '' ? page.extract.trim() : null,
      type: 'article',
      language: lang,
      contentUrl: page.fullurl || null,
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      identifiers: { wikipedia_pageid: page.pageid, wikipedia_edition: lang },
      metadata: { namespace: page.ns != null ? page.ns : null },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(this._api('en'), {
        action: 'query', list: 'search', srsearch: 'test', srlimit: 1,
        format: 'json', formatversion: 2,
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'MediaWiki search probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new WikipediaSource(deps, meta);
}

module.exports = { meta, createSource };
