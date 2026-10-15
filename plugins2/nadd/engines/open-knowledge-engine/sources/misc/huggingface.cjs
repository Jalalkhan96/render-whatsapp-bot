/*
 * sources/misc/huggingface.cjs — Hugging Face Hub adapter (REAL).
 *
 * Official Hub API (keyless for search):
 *   GET https://huggingface.co/api/models?search=<q>&limit=20
 *   GET https://huggingface.co/api/datasets?search=<q>&limit=20
 * Verified live 2026-10-05. Returns models AND datasets in one search()
 * (type 'model' / 'dataset', tags include 'model' or 'dataset').
 * License: from `license`, `cardData.license`, or `license:<spdx>` tags;
 * anything unrecognised stays 'unknown' via classifyLicense (never assumed).
 * Documented hub rate limits observed; keep traffic keyless and modest.
 */
'use strict';

const { BaseKnowledgeSource, noValue, classifyLicense } = require('../../core/base-source.cjs');

const API_BASE = 'https://huggingface.co/api';

const meta = {
  id: 'huggingface',
  name: 'Hugging Face Hub',
  category: 'AI',
  transport: 'api',
  baseUrl: 'https://huggingface.co',
  docsUrl: 'https://huggingface.co/docs/hub/api',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: true, metadata: true, images: false, documents: true, downloads: false, api: true, bulk: false, license: true, citations: false },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 6,
  description: 'Hugging Face Hub API: keyless search across models and datasets (returned together as type model/dataset). License from license field or license:<spdx> tags via classifyLicense; unrecognised stays unknown.',
};

function rawLicense(m) {
  // Prefer explicit fields, then the `license:<spdx>` tag convention.
  const direct = m && (m.license || (m.cardData && m.cardData.license));
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const tags = Array.isArray(m && m.tags) ? m.tags : [];
  for (const t of tags) {
    if (typeof t === 'string' && /^license:/i.test(t)) {
      const v = t.slice(t.indexOf(':') + 1).trim();
      if (v) return v;
    }
  }
  return undefined; // unknown stays unknown (§96/§38)
}

function cleanTags(tags, type) {
  const out = [type];
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (typeof t !== 'string' || !t.trim()) continue;
      if (/^(license|region|endpoints_compatible|deploy):/.test(t)) continue; // namespaced noise
      if (out.indexOf(t) === -1 && out.length < 24) out.push(t);
    }
  }
  return out;
}

class HuggingFaceSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
  }

  _mapRepo(m, kind) {
    // kind: 'model' | 'dataset'
    const repoId = (m.modelId != null && String(m.modelId).trim())
      || (m.id != null && String(m.id).trim()) || null;
    const url = repoId ? `https://huggingface.co/${kind === 'model' ? 'models' : 'datasets'}/${repoId}` : null;
    const author = typeof m.author === 'string' && m.author.trim() ? m.author.trim() : null;
    return {
      id: repoId,
      sourceId: repoId,
      sourceUrl: url,
      title: repoId,
      description: null,
      type: kind,
      creator: author,
      date: noValue(m.createdAt || null, null),
      updatedAt: noValue(m.lastModified || null, null),
      contentUrl: url,
      license: rawLicense(m),
      licenseUrl: null,
      rights: 'unknown',
      identifiers: { objectId: repoId, hubId: m._id != null ? String(m._id) : null },
      tags: cleanTags(m.tags, kind),
      metadata: {
        kind,
        author,
        likes: typeof m.likes === 'number' ? m.likes : null,
        downloads: typeof m.downloads === 'number' ? m.downloads : null,
        pipelineTag: m.pipeline_tag || null,
        gated: m.gated === true,
        private: m.private === true,
        trendingScore: typeof m.trendingScore === 'number' ? m.trendingScore : null,
        licenseSpdx: rawLicense(m) || null,
      },
    };
  }

  async _searchKind(kind, query, limit) {
    const endpoint = kind === 'model' ? 'models' : 'datasets';
    const url = this._buildUrl(`${API_BASE}/${endpoint}`, { search: String(query), limit });
    const data = await this.getJson(url);
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).map((m) => this._mapRepo(m, kind));
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const limit = Math.min(Number((options && options.limit) || 10), this.meta.rateLimit.maxResults);
    const perKind = Math.max(1, Math.ceil(limit / 2));
    const [models, datasets] = await Promise.all([
      this._searchKind('model', query, perKind),
      this._searchKind('dataset', query, perKind),
    ]);
    return this.normalizeMany(models.concat(datasets).slice(0, limit));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/models`, { search: 'test', limit: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Hugging Face Hub API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new HuggingFaceSource(deps, meta) };
