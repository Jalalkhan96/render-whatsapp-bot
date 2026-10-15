/*
 * sources/libraries/gallica.cjs — Gallica (BnF digital library) via SRU.
 *
 * Endpoint verified live 2026-10-05:
 *   https://gallica.bnf.fr/SRU?version=1.2&operation=searchRetrieve
 *     &query=gallica%20all%20%22paris%22&maximumRecords=2
 * returns HTTP 200 SRU 1.2 XML with Dublin Core records (dc:title, dc:creator,
 * dc:date, dc:identifier carrying ark URLs, plus thumbnail/highres links in
 * extraRecordData). Parsed lightly with regex — no XML parser dependency.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');

const meta = {
  id: 'gallica',
  name: 'Gallica (Bibliothèque nationale de France)',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://gallica.bnf.fr/SRU',
  docsUrl: 'https://www.bnf.fr/fr/gallica',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    images: true,
    documents: true,
    api: true,
    license: false,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 85,
  description: 'Gallica — the BnF digital library (books, serials, manuscripts, maps, images) searched via the public SRU API. No key required.',
};

const SRU = 'https://gallica.bnf.fr/SRU';

class GallicaSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _queryFor(query) {
    // "gallica all" is the all-fields index; strip quotes to avoid breaking CQL.
    const q = String(query).replace(/[""]/g, ' ').replace(/\s+/g, ' ').trim();
    return `gallica all "${q}"`;
  }

  async search(query, options) {
    if (!query || String(query).trim() === '') return [];
    const opts = options || {};
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), this.meta.rateLimit.maxResults);
    const page = Math.min(Math.max(Number(opts.page) || 1, 1), this.meta.rateLimit.maxPages);
    const url = this._buildUrl(SRU, {
      version: '1.2',
      operation: 'searchRetrieve',
      query: this._queryFor(query),
      startRecord: (page - 1) * limit + 1,
      maximumRecords: limit,
    });
    const xml = await this.getText(url, { headers: { Accept: 'application/xml, text/xml' } });
    const records = parseSruRecords(xml);
    return this.normalizeMany(records.slice(0, limit).map(mapRecord));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const url = this._buildUrl(SRU, {
        version: '1.2',
        operation: 'searchRetrieve',
        query: 'gallica all "test"',
        startRecord: 1,
        maximumRecords: 1,
      });
      const xml = await this.getText(url, { headers: { Accept: 'application/xml, text/xml' }, timeoutMs: 15000 });
      const total = extractTotalRecords(xml);
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: total != null ? `Gallica SRU reachable; probe query matched ${total} record(s)` : 'Gallica SRU reachable' };
    } catch (err) {
      return { id: this.id, status: 'unreachable', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

// --- Light SRU/XML parsing (regex; no XML dependency) -----------------------

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function field(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) out.push(decodeXmlEntities(m[1]).trim());
  return out;
}

function first(vals) {
  for (const v of vals) { if (v != null && String(v).trim() !== '') return String(v).trim(); }
  return null;
}

function extractTotalRecords(xml) {
  const m = /<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/.exec(xml);
  return m ? Number(m[1]) : null;
}

function parseSruRecords(xml) {
  const out = [];
  const re = /<srw:record>([\s\S]*?)<\/srw:record>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function mapRecord(block) {
  const titles = field(block, 'dc:title');
  const creators = field(block, 'dc:creator');
  const identifiers = field(block, 'dc:identifier');
  const arkUrl = identifiers.find((i) => i.includes('gallica.bnf.fr/ark:/')) || null;
  const thumbnail = first(field(block, 'thumbnail'));
  const highres = first(field(block, 'highres'));
  const link = first(field(block, 'link'));
  const ark = arkUrl || link;
  const title = first(titles);
  return {
    id: ark ? `gallica-${ark.replace(/^https?:\/\//, '')}` : (title ? `gallica-${title.slice(0, 60)}` : null),
    sourceId: ark,
    title: noValue(title, null),
    description: first(field(block, 'dc:description')),
    type: first(field(block, 'dc:type')) || 'unknown',
    creator: creators.length ? creators.join('; ') : null,
    date: first(field(block, 'dc:date')),
    language: first(field(block, 'dc:language')),
    country: 'France',
    sourceUrl: ark,
    contentUrl: highres,
    thumbnailUrl: thumbnail,
    license: first(field(block, 'dc:rights')) || 'unknown',
    licenseUrl: null,
    rights: first(field(block, 'dc:rights')) || 'unknown',
    identifiers: { ark: ark, otherIdentifiers: identifiers.filter((i) => i !== arkUrl) },
    tags: [],
    categories: field(block, 'dc:type').filter(Boolean),
    coordinates: { lat: null, lon: null },
    metadata: {
      publisher: first(field(block, 'dc:publisher')),
      source: first(field(block, 'dc:source')),
      docType: first(field(block, 'typedoc')),
      quality: first(field(block, 'nqamoyen')),
      totalSubjects: field(block, 'dc:subject'),
    },
  };
}

module.exports = { meta, createSource: (deps) => new GallicaSource(deps, meta) };
