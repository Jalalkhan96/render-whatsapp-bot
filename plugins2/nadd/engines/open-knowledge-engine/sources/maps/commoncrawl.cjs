/*
 * sources/maps/commoncrawl.cjs — Common Crawl index adapter.
 *
 * Endpoint (verified 2026-10-05):
 *   https://index.commoncrawl.org/CC-MAIN-2025-30-index?url=<q>*
 *     &output=json&limit=<n>
 *
 * DATASET SOURCE, not a webpage scraper: this returns crawl index records
 * (WARC filename/offset/length) from the latest known crawl index. Records
 * are type 'web_archive'; contentUrl points at the byte-range WARC object
 * on data.commoncrawl.org (consumers must fetch via HTTP Range requests).
 * capabilities.bulk is true — the Common Crawl corpus is designed for bulk
 * use via AWS/S3, and the columnar index supports bulk ingestion; the live
 * index API here is rate-limited politely. Content is the original sites'
 * content — licenses are 'unknown' per record (§75).
 *
 * Crawl index id: options.index overrides the default (e.g. 'CC-MAIN-2025-21').
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'commoncrawl',
  name: 'Common Crawl',
  category: 'web_archive',
  transport: 'api',
  baseUrl: 'https://index.commoncrawl.org',
  docsUrl: 'https://index.commoncrawl.org/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: true,
    downloads: false, api: true, bulk: true, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, maxResults: 20 },
  priority: 3,
  description: 'Common Crawl web-crawl index (dataset source, not a webpage scraper). Returns crawl index records with WARC filename/offset/length pointing at data.commoncrawl.org; bulk ingestion supported via the corpus on AWS/S3. Record content licenses are unknown.',
};

const DEFAULT_INDEX = 'CC-MAIN-2025-30';
const DATA_HOST = 'https://data.commoncrawl.org';

class CommonCrawlSource extends BaseKnowledgeSource {
  _mapRecord(rec, index) {
    const warcUrl = rec.filename ? `${DATA_HOST}/${rec.filename}` : null;
    const id = `${index}:${rec.digest || rec.urlkey || rec.url || 'record'}`;
    return {
      id: `commoncrawl:${id}`,
      sourceId: id,
      sourceUrl: warcUrl,
      title: rec.url || null,
      description: rec.mime ? `Crawled capture (${rec.mime})` : 'Crawled capture',
      type: 'web_archive',
      creator: null,
      date: rec.timestamp && /^\d{14}$/.test(rec.timestamp)
        ? new Date(Date.UTC(+rec.timestamp.slice(0, 4), +rec.timestamp.slice(4, 6) - 1,
          +rec.timestamp.slice(6, 8), +rec.timestamp.slice(8, 10),
          +rec.timestamp.slice(10, 12), +rec.timestamp.slice(12, 14))).toISOString()
        : null,
      language: rec.languages || null,
      country: null,
      contentUrl: warcUrl,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { cc_index: index, cc_digest: rec.digest || null, cc_urlkey: rec.urlkey || null },
      tags: ['common-crawl'],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: {
        crawlIndex: index,
        timestamp: rec.timestamp || null,
        originalUrl: rec.url || null,
        mimetype: rec.mime || null,
        mimeDetected: rec['mime-detected'] || null,
        statusCode: rec.status != null ? String(rec.status) : null,
        warc: {
          filename: rec.filename || null,
          offset: rec.offset != null && rec.offset !== '' ? Number(rec.offset) : null,
          length: rec.length != null && rec.length !== '' ? Number(rec.length) : null,
          warcUrl,
        },
        encoding: rec.encoding || null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const index = typeof options.index === 'string' && /^[A-Za-z0-9-]+$/.test(options.index)
      ? options.index : DEFAULT_INDEX;
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(`https://index.commoncrawl.org/${index}-index`, {
      url: q.includes('*') ? q : `${q}*`,
      output: 'json',
      limit,
      filter: options.statusCode ? `status:${options.statusCode}` : 'status:200',
    });
    const text = await this.getText(url);
    const records = [];
    for (const line of String(text || '').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { records.push(JSON.parse(t)); } catch { /* skip malformed lines */ }
      if (records.length >= limit) break;
    }
    return this.normalizeMany(records.map((r) => this._mapRecord(r, index)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getText(this._buildUrl(`https://index.commoncrawl.org/${DEFAULT_INDEX}-index`, {
        url: 'example.com/*', output: 'json', limit: 1, filter: 'status:200',
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: `Common Crawl index probe succeeded (${DEFAULT_INDEX})` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new CommonCrawlSource(deps, meta);
}

module.exports = { meta, createSource };
