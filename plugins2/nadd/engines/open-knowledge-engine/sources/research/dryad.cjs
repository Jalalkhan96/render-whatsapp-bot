/*
 * sources/research/dryad.cjs — Dryad Digital Repository adapter (limited).
 *
 * API: https://datadryad.org/api/v2/search?q=<q>&page=1&per_page=20
 * Docs: https://github.com/datadryad/dryad-app/blob/main/documentation/apis/link_relations.md
 * HAL+JSON: datasets live under _embedded['stash:datasets']. Each dataset has
 * a title, abstract, identifier ('doi:...') and _links (self/download).
 * Category 'dataset', type 'dataset'. 'limited' because Dryad's search is
 * keyword-oriented and per-dataset detail requires follow-up version calls.
 * No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'dryad',
  name: 'Dryad',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://datadryad.org/api/v2',
  docsUrl: 'https://github.com/datadryad/dryad-app/blob/main/documentation/apis/link_relations.md',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    documents: true,
    api: true,
    bulk: false,
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 12,
  description:
    'Dryad research-data repository search: dataset titles, abstracts, DOIs ' +
    'and download links. Limited: keyword search only, full version metadata ' +
    'needs per-dataset follow-up. No key required.',
};

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

function bareDoi(identifier) {
  if (typeof identifier !== 'string') return null;
  return identifier.replace(/^doi:/i, '').trim() || null;
}

class DryadSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl('https://datadryad.org/api/v2/search', {
        q: String(query),
        page: 1,
        per_page: limit,
      });
      const data = await this.getJson(url, { headers: { Accept: 'application/hal+json' } });
      const embedded = (data && data._embedded) || {};
      const sets = embedded['stash:datasets'] || [];
      return sets.map((d) => this._toResult(d)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(d) {
    d = d || {};
    const doi = bareDoi(d.identifier);
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    const links = d._links || {};
    const selfHref = links.self && links.self.href ? String(links.self.href) : null;
    const downloadHref = links['stash:download'] && links['stash:download'].href
      ? String(links['stash:download'].href)
      : null;
    const absUrl = (p) => (p && p.startsWith('http') ? p : p ? `https://datadryad.org${p}` : null);
    const sourceUrl = absUrl(selfHref);
    return dataset({
      id: doi || null,
      source: this.id,
      sourceId: doi || null,
      sourceUrl: doi ? `https://doi.org/${doi}` : sourceUrl,
      title: noValue(d.title, null),
      description: stripHtml(d.abstract),
      type: 'dataset',
      creator: null,
      date: noValue(d.publicationDate, null),
      updatedAt: noValue(d.modificationDate, null),
      contentUrl: absUrl(downloadHref),
      identifiers,
      tags: [],
      categories: [],
      publisher: 'Dryad',
      datasetMetadata: {
        identifier: noValue(d.identifier, null),
      },
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const rows = await this.search('science', { limit: 1 });
      return {
        id: this.id,
        status: rows.length > 0 ? 'ok' : 'degraded',
        latencyMs: Date.now() - t0,
        detail: `HAL+JSON probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new DryadSource(deps, meta),
};
