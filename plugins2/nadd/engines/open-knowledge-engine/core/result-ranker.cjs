/*
 * core/result-ranker.cjs — ranking (§52) + source authority tiers (§53).
 *
 * Authority tiers (higher first):
 *   5 government / official dataset publisher
 *   4 museum / library (official collections)
 *   3 Wikimedia structured data (Wikidata, DBpedia, Commons metadata)
 *   2 research registry / academic index (OpenAlex, Crossref, arXiv, PubMed…)
 *   1 archive (Internet Archive, LOC collections, DPLA…)
 *   0 third-party aggregator
 *
 * Wikipedia is a discovery layer, not the final authority for factual claims.
 */
'use strict';

const { normStr } = require('./deduplicator.cjs');

// Authority tier per source id. Default 1 (archive) when unknown.
const AUTHORITY = {
  // tier 5 — official government / data publishers
  'loc': 5, 'chronicling-america': 5, 'congress': 5, 'govinfo': 5, 'datagov': 5,
  'nara': 5, 'nara-catalog': 5, 'loc-web-archives': 5, 'datagovuk': 5,
  'dataeuropa': 5, 'worldbank': 5, 'undata': 5, 'oecd': 5, 'who': 5,
  'unesco-uis': 5, 'imf': 5, 'noaa': 5, 'usgs': 5,
  // tier 4 — museums / libraries (official collections)
  'smithsonian': 4, 'smithsonian-biodiversity': 4, 'met-museum': 4, 'artic': 4,
  'clevelandart': 4, 'rijksmuseum': 4, 'europeana': 4, 'harvard': 4,
  'wellcome': 4, 'getty': 4, 'yale': 4, 'british-library': 4,
  'dpla': 4, 'trove': 4, 'digitalnz': 4, 'nla': 4, 'naa': 4,
  'nz-archives': 4, 'bodleian': 4, 'gallica': 4, 'perseus': 4,
  'nasa': 4,
  // tier 3 — Wikimedia structured / discovery layer
  'wikidata': 3, 'wdqs': 3, 'dbpedia': 3, 'wikimedia-commons': 3,
  'wikipedia': 3, 'wikisource': 3, 'wiktionary': 3, 'wikibooks': 3,
  'wikiversity': 3, 'wikiquote': 3, 'wikinews': 3, 'wikivoyage': 3,
  'openstreetmap': 3, 'geonames': 3, 'geonames-wikipedia': 3, 'geograph': 3,
  // tier 2 — research registries / academic indexes
  'openalex': 2, 'crossref': 2, 'semanticscholar': 2, 'arxiv': 2,
  'pubmed': 2, 'pmc': 2, 'europepmc': 2, 'doaj': 2, 'core': 2,
  'zenodo': 2, 'figshare': 2, 'dryad': 2, 'osf': 2, 'ssrn': 2,
  'researchgate': 2, 'bhl': 2, 'huggingface': 2, 'opencorporates': 2,
  'opensanctions': 2,
  // tier 1 — archives / misc
  'internet-archive': 1, 'open-library': 1, 'gutenberg': 1, 'hathitrust': 1,
  'google-books': 1, 'isfdb': 1, 'standardebooks': 1, 'librivox': 1,
  'manybooks': 1, 'feedbooks': 1, 'wayback': 1, 'commoncrawl': 1,
  'archive-it': 1, 'uk-web-archive': 1, 'sacred-texts': 1,
  'public-domain-review': 1, 'picryl': 1, 'mapillary': 1, 'wikimapia': 1,
  // tier 0 — aggregators / consumer data
  'openfoodfacts': 0, 'openbeautyfacts': 0, 'openproductsfacts': 0,
  'wikidata-products': 0, 'open-product-data': 0, 'google-arts-culture': 0,
};

function authorityOf(sourceId) {
  if (sourceId && Object.prototype.hasOwnProperty.call(AUTHORITY, sourceId)) return AUTHORITY[sourceId];
  return 1;
}

function similarityScore(query, result) {
  const q = normStr(query);
  const t = normStr(result && result.title);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.85;
  const words = q.split(' ').filter((w) => w.length > 2);
  if (!words.length) return 0;
  const hits = words.filter((w) => t.includes(w)).length;
  return 0.4 + 0.4 * (hits / words.length);
}

function licenseConfidence(result) {
  const lic = String((result && result.license) || 'unknown').toLowerCase();
  if (lic === 'unknown' || lic === 'not_available') return 0;
  if (lic.includes('public-domain') || lic.startsWith('cc0')) return 1;
  if (lic.startsWith('cc-') || lic === 'open-access') return 0.8;
  return 0.5;
}

function rankResults(results, query, opts) {
  opts = opts || {};
  const scored = (results || []).map((r) => {
    const idMatch = r && r.identifiers && Object.keys(r.identifiers).length > 0 ? 0.15 : 0;
    const exactTitle = normStr(r && r.title) === normStr(query) ? 0.25 : 0;
    const creatorMatch = opts.creator && r && normStr(r.creator).includes(normStr(opts.creator)) ? 0.1 : 0;
    const dateRel = r && r.date ? 0.05 : 0;
    const auth = authorityOf(r && r.source) * 0.12;
    const lic = licenseConfidence(r) * 0.05;
    const sim = similarityScore(query, r) * 0.28;
    const score = sim + auth + idMatch + exactTitle + creatorMatch + dateRel + lic;
    return { result: r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const max = opts.maxResults != null ? opts.maxResults : (process.env.MAX_FINAL_RESULTS ? Number(process.env.MAX_FINAL_RESULTS) : 50);
  return scored.slice(0, Math.max(1, max)).map((s) => s.result);
}

module.exports = {
  AUTHORITY,
  authorityOf,
  similarityScore,
  licenseConfidence,
  rankResults,
};
