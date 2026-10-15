/*
 * core/entity-graph.cjs — subject/predicate/object/source/confidence triples (§20).
 *
 * Entities: PERSON, WORK, BOOK, AUTHOR, INSTITUTION, PLACE, EVENT.
 */
'use strict';

class EntityGraph {
  constructor(store) {
    this.store = store || null;
    this._mem = [];
  }

  addTriple(subject, predicate, object, source, confidence) {
    const t = {
      subject: String(subject || 'unknown'),
      predicate: String(predicate || 'relatedTo'),
      object: String(object || 'unknown'),
      source: String(source || 'unknown'),
      confidence: confidence != null && Number.isFinite(Number(confidence)) ? Number(confidence) : 0.5,
      createdAt: new Date().toISOString(),
    };
    this._mem.push(t);
    if (this.store) {
      try { this.store.insert('knowledge_relationships', t); } catch (_) { /* best effort */ }
    }
    return t;
  }

  fromResult(result) {
    // Derive simple triples from a normalized result's identifiers/links.
    const ids = (result && result.identifiers) || {};
    const title = (result && result.title) || 'unknown';
    const out = [];
    const add = (pred, obj, conf) => { if (obj && obj !== 'unknown') out.push(this.addTriple(title, pred, obj, result.source, conf)); };
    add('describedBy', ids.wikidata ? `wikidata:${ids.wikidata}` : null, 0.95);
    add('describedBy', ids.wikipediaPageId ? `wikipedia:page:${ids.wikipediaPageId}` : null, 0.9);
    add('hasIdentifier', ids.doi ? `doi:${ids.doi}` : null, 1.0);
    add('hasIdentifier', ids.isbn || ids.isbn13 ? `isbn:${ids.isbn || ids.isbn13}` : null, 1.0);
    add('createdBy', result.creator || null, 0.7);
    add('locatedAt', result.coordinates && result.coordinates.lat != null ? `${result.coordinates.lat},${result.coordinates.lon}` : null, 0.8);
    return out;
  }

  query(subject) {
    return this._mem.filter((t) => t.subject === subject);
  }

  all(limit) { return limit != null ? this._mem.slice(0, limit) : this._mem.slice(); }
}

module.exports = { EntityGraph };
