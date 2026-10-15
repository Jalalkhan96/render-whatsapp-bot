/*
 * sources/maps/wayback.cjs — Internet Archive Wayback Machine adapter.
 *
 * Endpoints (both verified 2026-10-05):
 *   CDX:         https://web.archive.org/cdx/search/cdx?url=<q>*
 *                  &output=json&limit=<n>&filter=statuscode:200&collapse=urlkey
 *   Availability: https://archive.org/wayback/available?url=<q>
 *                  (single-URL closest snapshot)
 *
 * Results are type 'web_archive' with sourceUrl pointing at the snapshot.
 * METADATA ONLY — the engine NEVER downloads archived pages (§75); the CDX
 * record is the result. Snapshot licenses are 'unknown' (the original site's
 * license, if any, is not captured by CDX).
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wayback',
  name: 'Wayback Machine',
  category: 'web_archive',
  transport: 'api',
  baseUrl: 'https://web.archive.org',
  docsUrl: 'https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxResults: 20 },
  priority: 2,
  description: 'Internet Archive Wayback Machine captures via the CDX API (plus the availability API for single URLs). Metadata-only: returns snapshot records pointing at archived captures; archived pages are never downloaded. Snapshot licenses are unknown.',
};

const CDX_URL = 'https://web.archive.org/cdx/search/cdx';
const AVAIL_URL = 'https://archive.org/wayback/available';

function snapshotUrl(timestamp, original) {
  return timestamp && original ? `https://web.archive.org/web/${timestamp}/${original}` : null;
}

function parseTimestamp(ts) {
  // "20261004100351" -> ISO, or null.
  if (!/^\d{14}$/.test(String(ts || ''))) return null;
  const s = String(ts);
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

class WaybackSource extends BaseKnowledgeSource {
  _mapCdxRow(cols) {
    // CDX output=json rows: [urlkey, timestamp, original, mimetype, statuscode, digest, length]
    const [urlkey, timestamp, original, mimetype, statuscode, digest, length] = cols;
    const snap = snapshotUrl(timestamp, original);
    return {
      id: `wayback:${timestamp}:${original}`,
      sourceId: `${timestamp}:${original}`,
      sourceUrl: snap,
      title: original || null,
      description: statuscode ? `Archived capture (HTTP ${statuscode})` : 'Archived capture',
      type: 'web_archive',
      creator: null,
      date: parseTimestamp(timestamp),
      language: null,
      country: null,
      contentUrl: snap,
      thumbnailUrl: null,
      license: 'unknown',
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { wayback_timestamp: timestamp || null, wayback_digest: digest || null, urlkey: urlkey || null },
      tags: ['wayback'],
      categories: [],
      coordinates: { lat: null, lon: null },
      metadata: {
        snapshot: { timestamp: timestamp || null, original: original || null, snapshotUrl: snap },
        mimetype: mimetype || null,
        statusCode: statuscode != null ? String(statuscode) : null,
        contentLength: length != null && length !== '' ? Number(length) : null,
      },
    };
  }

  _mapAvailability(url, payload) {
    const closest = payload && payload.archived_snapshots && payload.archived_snapshots.closest;
    if (!closest || !closest.url) return null;
    return {
      id: `wayback:${closest.timestamp}:${url}`,
      sourceId: `${closest.timestamp}:${url}`,
      sourceUrl: closest.url,
      title: url,
      description: closest.available ? 'Closest archived snapshot' : 'Archived snapshot (availability uncertain)',
      type: 'web_archive',
      date: parseTimestamp(closest.timestamp),
      license: 'unknown',
      rights: 'unknown',
      identifiers: { wayback_timestamp: closest.timestamp || null },
      tags: ['wayback'],
      coordinates: { lat: null, lon: null },
      metadata: { snapshot: { timestamp: closest.timestamp || null, original: url, snapshotUrl: closest.url } },
    };
  }

  _isSingleUrl(q) {
    return /^https?:\/\/[^\s*?]+$/i.test(q);
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));

    if (this._isSingleUrl(q)) {
      const data = await this.getJson(this._buildUrl(AVAIL_URL, { url: q }));
      const hit = this._mapAvailability(q, data);
      return this.normalizeMany(hit ? [hit] : []);
    }

    const url = this._buildUrl(CDX_URL, {
      url: `${q}*`,
      output: 'json',
      limit,
      filter: 'statuscode:200',
      collapse: 'urlkey',
    });
    const data = await this.getJson(url);
    if (!Array.isArray(data) || data.length < 2) return [];
    const [, ...rows] = data; // first row is the header
    return this.normalizeMany(rows.filter(Array.isArray).map((r) => this._mapCdxRow(r)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl(AVAIL_URL, { url: 'example.com' }));
      const ok = data && data.archived_snapshots && data.archived_snapshots.closest;
      return {
        id: this.id,
        status: ok ? 'ok' : 'limited',
        latencyMs: Date.now() - t0,
        detail: ok ? 'Wayback availability API probe succeeded' : 'Wayback availability probe returned no snapshot',
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new WaybackSource(deps, meta);
}

module.exports = { meta, createSource };
