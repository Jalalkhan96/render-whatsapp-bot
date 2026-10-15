/*
 * sources/misc/smithsonian-biodiversity.cjs — Smithsonian Open Access API,
 * biodiversity / natural-history scope (REAL).
 *
 * Official API: GET https://api.si.edu/openaccess/api/v1.0/search
 *   params: q=<q>, api_key=<SMITHSONIAN_API_KEY>, rows=20
 *   -> {response:{rowCount, rows:[{id, title, unitCode, content:{descriptiveNonRepeating, freetext, indexedStructured}}]}}
 * Requires a free key (env SMITHSONIAN_API_KEY, from https://api.si.edu).
 * Keyless -> 'auth_required': search returns [] — never fabricated.
 * Verified 2026-10-05: keyless request returns
 * {"error":{"code":"API_KEY_MISSING","message":"No api_key was supplied."}}.
 *
 * SCOPE NOTE: this adapter exists for specimen/species/nature queries on the
 * SAME Smithsonian Open Access API as the 'smithsonian' adapter. Overlap is
 * intentional and harmless: the engine-level dedup (by object ID) prevents
 * double-counting. A client-side natural-history filter (unitCode like NMNH /
 * NZP / STRI / SERC, or natural-history departments) applies only when the
 * record's unit/department fields are reliably present; records missing those
 * fields are kept rather than dropped. License comes only from the record's
 * own media-rights fields; missing stays 'unknown' (§38).
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');

const API_BASE = 'https://api.si.edu/openaccess/api/v1.0';

const NATURAL_HISTORY_UNIT = /^(NMNH|NZP|STRI|SERC)$/i;
const NATURAL_HISTORY_DEPT = /natural history|entomology|botany|vertebrate|invertebrate|paleobiology|mineral|anthropology|zoo/i;

function firstContent(v) {
  // SI wraps freetext values as [{content:"..."}, ...].
  if (Array.isArray(v)) {
    for (const x of v) {
      const c = firstContent(x);
      if (c) return c;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    if (typeof v.content === 'string' && v.content.trim()) return v.content.trim();
    return null;
  }
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function strList(v) {
  if (Array.isArray(v)) {
    return v.map((x) => firstContent(x) || (typeof x === 'string' ? x : null))
      .filter((x) => x != null && x.trim() !== '');
  }
  const s = firstContent(v);
  return s ? [s] : [];
}

function firstHttpUrl(...vals) {
  for (const v of vals) {
    for (const s of strList(v)) {
      if (/^https?:\/\//i.test(s)) return s;
    }
  }
  return null;
}

const meta = {
  id: 'smithsonian-biodiversity',
  name: 'Smithsonian Biodiversity (Open Access)',
  category: 'science',
  transport: 'api',
  baseUrl: 'https://api.si.edu',
  docsUrl: 'https://api.si.edu/learn/',
  implemented: true,
  status: process.env.SMITHSONIAN_API_KEY ? 'ok' : 'auth_required',
  requiresKey: true,
  envKeys: ['SMITHSONIAN_API_KEY'],
  capabilities: { search: true, metadata: true, images: true, api: true, license: true, citations: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 5,
  description: 'Smithsonian Open Access API scoped to biodiversity/natural-history queries (NMNH/NZP/STRI/SERC + natural-history departments when unitCode is reliably present). Needs a free key (SMITHSONIAN_API_KEY). Same underlying records as the \'smithsonian\' adapter may appear; engine-level dedup (by object ID) prevents double-counting.',
};

class SmithsonianBiodiversitySource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m);
    this.apiKey = (deps && (deps.apiKey || deps.key)) || process.env.SMITHSONIAN_API_KEY || null;
  }

  _naturalHistory(row, dnr, freetext) {
    const unit = row && typeof row.unitCode === 'string' ? row.unitCode.trim() : null;
    const dept = firstContent(freetext && freetext.department) || firstContent(dnr && dnr.department);
    if (!unit && !dept) return true; // field not reliably present: keep, don't drop
    if (unit && NATURAL_HISTORY_UNIT.test(unit)) return true;
    if (dept && NATURAL_HISTORY_DEPT.test(dept)) return true;
    return false;
  }

  _map(row) {
    const content = row && typeof row.content === 'object' ? row.content : {};
    const dnr = content.descriptiveNonRepeating && typeof content.descriptiveNonRepeating === 'object'
      ? content.descriptiveNonRepeating : {};
    const freetext = content.freetext && typeof content.freetext === 'object' ? content.freetext : {};
    const indexed = content.indexedStructured && typeof content.indexedStructured === 'object'
      ? content.indexedStructured : {};
    const id = row && row.id != null ? String(row.id) : null;
    const title = noValue(firstContent(dnr.title) || (typeof row.title === 'string' ? row.title.trim() : null), null);
    const names = strList(indexed.name).concat(strList(freetext.name)).filter((n, i, a) => a.indexOf(n) === i);
    const thumb = firstHttpUrl(
      freetext.online_media_type,
      content.online_media,
      indexed.media,
      freetext.thumbnail
    );
    return {
      id,
      sourceId: id,
      sourceUrl: firstHttpUrl(freetext.record_link || dnr.record_link) || null,
      title,
      description: noValue(firstContent(freetext.notes) || strList(freetext.physicalDescription)[0] || null, null),
      type: noValue(strList(indexed.object_type)[0] || strList(freetext.objectType)[0] || 'specimen', 'specimen'),
      creator: noValue(names[0] || null, null),
      date: noValue(firstContent(dnr.date) || firstContent(freetext.date) || null, null),
      language: noValue(firstContent(dnr.language) || null, null),
      thumbnailUrl: thumb,
      contentUrl: thumb,
      license: noValue(firstContent(freetext.rights) || firstContent(dnr.rights) || null, undefined),
      licenseUrl: firstHttpUrl(freetext.rights) || null,
      rights: noValue(firstContent(freetext.rights) || firstContent(dnr.rights) || null, 'unknown'),
      identifiers: { objectId: id, unitCode: row.unitCode || null },
      tags: ['biodiversity', 'natural-history'],
      metadata: {
        unitCode: row.unitCode || null,
        department: firstContent(freetext.department) || firstContent(dnr.department) || null,
        dataSource: firstContent(dnr.data_source) || null,
        scientificName: noValue(strList(indexed.scientific_name)[0] || null, null),
        names,
      },
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    if (!this.apiKey) return []; // auth_required path: no key configured
    const opts = options || {};
    const naturalHistoryOnly = opts.naturalHistoryOnly !== false;
    const limit = Math.min(Number(opts.limit || 10), this.meta.rateLimit.maxResults);
    const url = this._buildUrl(`${API_BASE}/search`, {
      q: String(query),
      api_key: this.apiKey,
      rows: limit,
    });
    const data = await this.getJson(url);
    const rows = data && data.response && Array.isArray(data.response.rows) ? data.response.rows : [];
    const mapped = [];
    for (const row of rows) {
      const content = row && typeof row.content === 'object' ? row.content : {};
      const dnr = content.descriptiveNonRepeating || {};
      const freetext = content.freetext || {};
      if (naturalHistoryOnly && !this._naturalHistory(row, dnr, freetext)) continue;
      mapped.push(this._map(row));
      if (mapped.length >= limit) break;
    }
    return this.normalizeMany(mapped);
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'SMITHSONIAN_API_KEY not configured; search disabled' };
    }
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(`${API_BASE}/search`, { q: 'test', api_key: this.apiKey, rows: 1 }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Smithsonian Open Access API reachable' };
    } catch (err) {
      return { id: this.id, status: 'degraded', latencyMs: Date.now() - t0, detail: `probe failed: ${String(err.message).slice(0, 160)}` };
    }
  }
}

module.exports = { meta, createSource: (deps) => new SmithsonianBiodiversitySource(deps, meta) };
