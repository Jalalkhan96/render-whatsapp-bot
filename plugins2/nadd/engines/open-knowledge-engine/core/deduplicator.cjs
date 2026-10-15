/*
 * core/deduplicator.cjs — dedup + cross-source entity matching (§18, §19).
 *
 * 1. Identifier-first: DOI / ISBN / Wikidata QID / Wikipedia pageid /
 *    Internet Archive identifier / OpenAlex ID / GeoNames ID / museum
 *    object ID / dataset ID.
 * 2. Fallback: normalized title + creator + date.
 * 3. Entity matching (§19): group results about the same real-world entity
 *    (e.g. Albert Einstein across Wikipedia/Wikidata/DBpedia/OpenAlex/IA)
 *    into one logical entity while retaining all source references.
 */
'use strict';

function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normDate(d) {
  if (!d) return '';
  const m = String(d).match(/(\d{4})/);
  return m ? m[1] : '';
}

const IDENTIFIER_KEYS = [
  'doi', 'isbn', 'isbn13', 'wikidata', 'wikidataId', 'qid',
  'wikipediaPageId', 'wikipedia_pageid', 'ia', 'iaIdentifier',
  'internetArchive', 'openalex', 'openAlexId', 'geonames', 'geonamesId',
  'pmid', 'pmcid', 'arxiv', 'orcid', 'objectId', 'datasetId',
];

function primaryIdentifier(result) {
  const ids = (result && result.identifiers) || {};
  for (const k of IDENTIFIER_KEYS) {
    if (ids[k]) return `${k}:${String(ids[k]).toLowerCase().trim()}`;
  }
  if (result && result.sourceId) return `${result.source || 'src'}:sid:${String(result.sourceId).toLowerCase().trim()}`;
  return null;
}

function fallbackKey(result) {
  const title = normStr(result && result.title);
  if (!title) return null;
  const creator = normStr(result.creator);
  const date = normDate(result.date);
  return `tcd:${title}|${creator}|${date}`;
}

function dedupe(results) {
  // Returns { results: [...unique], duplicatesRemoved: n }
  const seen = new Map(); // key -> index
  const unique = [];
  let duplicatesRemoved = 0;
  for (const r of results || []) {
    const idKey = primaryIdentifier(r);
    if (idKey && seen.has(idKey)) { duplicatesRemoved += 1; continue; }
    const fbKey = fallbackKey(r);
    if (!idKey && fbKey && seen.has(fbKey)) { duplicatesRemoved += 1; continue; }
    const key = idKey || fbKey || `none:${unique.length}`;
    seen.set(key, unique.length);
    unique.push(r);
  }
  return { results: unique, duplicatesRemoved };
}

function matchEntities(results) {
  // §19: cluster results referencing the same entity, keep all source refs.
  const clusters = new Map(); // entityKey -> { entityKey, name, sources: [], results: [] }
  for (const r of results || []) {
    const ids = (r && r.identifiers) || {};
    const qid = ids.wikidata || ids.wikidataId || ids.qid;
    let key;
    if (qid) key = `wikidata:${String(qid).toUpperCase().replace(/^Q/, 'Q')}`;
    else if (ids.doi) key = `doi:${String(ids.doi).toLowerCase()}`;
    else if (ids.openalex || ids.openAlexId) key = `openalex:${String(ids.openalex || ids.openAlexId).toLowerCase()}`;
    else {
      const t = normStr(r && r.title);
      const c = normStr(r && r.creator);
      if (!t) continue;
      key = `title:${t}|${c}`;
    }
    if (!clusters.has(key)) {
      clusters.set(key, { entityKey: key, name: (r && r.title) || 'unknown', sourceIds: [], results: [] });
    }
    const cl = clusters.get(key);
    cl.results.push(r);
    if (r && r.source && !cl.sourceIds.includes(r.source)) cl.sourceIds.push(r.source);
  }
  return Array.from(clusters.values());
}

module.exports = {
  normStr,
  normDate,
  primaryIdentifier,
  fallbackKey,
  dedupe,
  matchEntities,
};
