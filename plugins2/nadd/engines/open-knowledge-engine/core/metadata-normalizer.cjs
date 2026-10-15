/*
 * core/metadata-normalizer.cjs — typed result normalizers.
 *
 * §7 universal format plus typed shapes:
 *   book (§8), research (§9), archive_item (§10), person (§11),
 *   place (§12), dataset (§13).
 */
'use strict';

const { universalResult, classifyLicense, noValue, pickFirst } = require('./base-source.cjs');

function asArray(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return [];
  return [v];
}

function book(partial) {
  // §8 document result for books/documents
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: 'book' }));
  u.metadata.book = {
    title: u.title,
    author: asArray(pickFirst(partial.author, partial.authors, partial.creator)),
    publisher: noValue(partial.publisher, null),
    publicationDate: noValue(partial.publicationDate || partial.date, null),
    isbn: asArray(partial.isbn),
    language: u.language,
    edition: noValue(partial.edition, null),
    pageCount: Number.isFinite(Number(partial.pageCount)) ? Number(partial.pageCount) : 0,
    source: u.source,
    sourceUrl: u.sourceUrl,
    downloadAvailable: partial.downloadAvailable === true,
    license: u.license,
  };
  return u;
}

function research(partial) {
  // §9 article / research result
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: 'research' }));
  u.metadata.research = {
    title: u.title,
    authors: asArray(pickFirst(partial.authors, partial.author, partial.creator)),
    abstract: noValue(partial.abstract || partial.description, null),
    doi: noValue(partial.doi || (partial.identifiers && partial.identifiers.doi), null),
    journal: noValue(partial.journal, null),
    publicationDate: noValue(partial.publicationDate || partial.date, null),
    citations: Number.isFinite(Number(partial.citations)) ? Number(partial.citations) : 0,
    url: noValue(partial.url || partial.sourceUrl || partial.contentUrl, null),
    openAccess: partial.openAccess === true,
    license: u.license,
  };
  return u;
}

function archiveItem(partial) {
  // §10 archive item
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: 'archive_item' }));
  u.metadata.archive = {
    identifier: noValue(partial.identifier || partial.sourceId, null),
    title: u.title,
    description: u.description,
    creator: u.creator,
    date: u.date,
    collection: noValue(partial.collection, null),
    mediaType: asArray(partial.mediaType),
    sourceUrl: u.sourceUrl,
    files: Array.isArray(partial.files) ? partial.files : [],
    rights: u.rights,
  };
  return u;
}

function person(partial) {
  // §11 person result
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: pickFirst(partial.subtype, partial.personType) || 'person' }));
  u.metadata.person = {
    name: noValue(partial.name || partial.title, null),
    aliases: asArray(partial.aliases),
    birth: noValue(partial.birth, null),
    death: noValue(partial.death, null),
    occupation: asArray(partial.occupation),
    nationality: noValue(partial.nationality, null),
    works: asArray(partial.works),
    organizations: asArray(partial.organizations),
    wikipediaUrl: noValue(partial.wikipediaUrl, null),
    wikidataId: noValue(partial.wikidataId || (partial.identifiers && partial.identifiers.wikidata), null),
    dbpediaUri: noValue(partial.dbpediaUri, null),
    openAlexId: noValue(partial.openAlexId, null),
    identifiers: u.identifiers,
  };
  return u;
}

function place(partial) {
  // §12 place result
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: 'place' }));
  u.metadata.place = {
    name: noValue(partial.name || partial.title, null),
    country: u.country,
    region: noValue(partial.region, null),
    city: noValue(partial.city, null),
    latitude: u.coordinates.lat,
    longitude: u.coordinates.lon,
    population: Number.isFinite(Number(partial.population)) ? Number(partial.population) : null,
    timezone: noValue(partial.timezone, null),
    elevation: Number.isFinite(Number(partial.elevation)) ? Number(partial.elevation) : null,
    wikipediaUrl: noValue(partial.wikipediaUrl, null),
    wikidataId: noValue(partial.wikidataId || (partial.identifiers && partial.identifiers.wikidata), null),
    geonamesId: noValue(partial.geonamesId || (partial.identifiers && partial.identifiers.geonames), null),
  };
  return u;
}

function dataset(partial) {
  // §13 dataset result
  partial = partial || {};
  const u = universalResult(Object.assign({}, partial, { type: 'dataset' }));
  u.metadata.dataset = {
    title: u.title,
    description: u.description,
    publisher: noValue(partial.publisher, null),
    organization: noValue(partial.organization, null),
    license: u.license,
    format: asArray(partial.format),
    downloadUrl: noValue(partial.downloadUrl, null),
    apiUrl: noValue(partial.apiUrl, null),
    updatedAt: noValue(partial.updatedAt, null),
    size: noValue(partial.size, null),
    metadata: partial.datasetMetadata && typeof partial.datasetMetadata === 'object' ? partial.datasetMetadata : {},
  };
  return u;
}

module.exports = {
  universal: universalResult,
  classifyLicense,
  noValue,
  asArray,
  book,
  research,
  archiveItem,
  person,
  place,
  dataset,
};
