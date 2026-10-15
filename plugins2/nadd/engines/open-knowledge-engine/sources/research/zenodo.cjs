/*
 * sources/research/zenodo.cjs — Zenodo records adapter.
 *
 * API: https://zenodo.org/api/records?q=<q>&size=20
 * Docs: https://developers.zenodo.org/#list-records
 * hits.hits[] carries metadata.title/creators/description/publication_date/doi,
 * license and access_right, plus links. Category 'dataset' — Zenodo records
 * are heterogeneous (datasets, software, papers). No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'zenodo',
  name: 'Zenodo',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://zenodo.org/api',
  docsUrl: 'https://developers.zenodo.org/#list-records',
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
    license: true,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 10,
  description:
    'Zenodo open repository search: records with titles, creators, ' +
    'descriptions, publication dates, DOIs, licenses and access rights. ' +
    'No key required.',
};

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

class ZenodoSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl('https://zenodo.org/api/records', { q: String(query), size: limit });
      const data = await this.getJson(url);
      const hits = (data && data.hits && Array.isArray(data.hits.hits)) ? data.hits.hits : [];
      return hits.map((h) => this._toResult(h)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(h) {
    h = h || {};
    const m = h.metadata || {};
    const creatorsRaw = Array.isArray(m.creators) ? m.creators : [];
    const creators = creatorsRaw.map((c) => c && c.name).filter((n) => typeof n === 'string' && n.trim() !== '');
    const doi = noValue(m.doi, null);
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    const licRaw = m.license;
    const license = typeof licRaw === 'string' ? licRaw : (licRaw && licRaw.id ? String(licRaw.id) : null);
    const recordId = h.id != null ? String(h.id) : null;
    const recordUrl = recordId ? `https://zenodo.org/records/${recordId}` : null;
    const subjects = Array.isArray(m.subjects) ? m.subjects.map((s) => s && s.term).filter(Boolean) : [];
    return dataset({
      id: recordId,
      source: this.id,
      sourceId: recordId,
      sourceUrl: doi ? `https://doi.org/${doi}` : recordUrl,
      title: noValue(m.title, null),
      description: stripHtml(m.description),
      type: 'dataset',
      creator: creators[0] || null,
      date: noValue(m.publication_date, null),
      updatedAt: noValue(m.publication_date, null),
      contentUrl: recordUrl,
      license: noValue(license, null),
      identifiers,
      tags: subjects.slice(0, 10),
      categories: m.resource_type && m.resource_type.type ? [String(m.resource_type.type)] : [],
      publisher: 'Zenodo',
      organization: noValue(m.publisher, null),
      datasetMetadata: {
        resource_type: m.resource_type && m.resource_type.type ? String(m.resource_type.type) : null,
        access_right: noValue(m.access_right, null),
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
        detail: `API probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new ZenodoSource(deps, meta),
};
