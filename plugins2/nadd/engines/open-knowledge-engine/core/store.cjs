/*
 * core/store.cjs — JSON-file persistence for the §90 tables.
 *
 * Tables: knowledge_entities, knowledge_sources, knowledge_items,
 *   knowledge_relationships, knowledge_documents, knowledge_images,
 *   knowledge_datasets, knowledge_places, knowledge_research,
 *   knowledge_archive_items, knowledge_licenses, knowledge_searches,
 *   knowledge_source_health, knowledge_ingest_runs
 *
 * Zero dependencies. Each table is a JSON array file under the data dir.
 * Writes are append-with-id; batch-friendly for the sequential pipeline.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TABLES = [
  'knowledge_entities',
  'knowledge_sources',
  'knowledge_items',
  'knowledge_relationships',
  'knowledge_documents',
  'knowledge_images',
  'knowledge_datasets',
  'knowledge_places',
  'knowledge_research',
  'knowledge_archive_items',
  'knowledge_licenses',
  'knowledge_searches',
  'knowledge_source_health',
  'knowledge_ingest_runs',
];

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    this._cache = new Map();
  }

  _file(table) { return path.join(this.dataDir, `${table}.json`); }

  _read(table) {
    if (this._cache.has(table)) return this._cache.get(table);
    const f = this._file(table);
    let rows = [];
    try {
      if (fs.existsSync(f)) rows = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!Array.isArray(rows)) rows = [];
    } catch (_) { rows = []; }
    this._cache.set(table, rows);
    return rows;
  }

  _write(table) {
    const rows = this._cache.get(table) || [];
    // Disk protection: cap table growth; keep most recent 50k rows.
    const capped = rows.length > 50000 ? rows.slice(rows.length - 50000) : rows;
    this._cache.set(table, capped);
    fs.writeFileSync(this._file(table), JSON.stringify(capped), 'utf8');
  }

  insert(table, row) {
    if (!TABLES.includes(table)) throw new Error(`unknown table ${table}`);
    const rows = this._read(table);
    const r = Object.assign({ _id: uid(table), _insertedAt: new Date().toISOString() }, row);
    rows.push(r);
    this._write(table);
    return r;
  }

  insertMany(table, rows) {
    if (!TABLES.includes(table)) throw new Error(`unknown table ${table}`);
    const existing = this._read(table);
    const added = (rows || []).map((row) => Object.assign({ _id: uid(table), _insertedAt: new Date().toISOString() }, row));
    existing.push(...added);
    this._write(table);
    return added.length;
  }

  find(table, predicate, limit) {
    const rows = this._read(table);
    const out = typeof predicate === 'function' ? rows.filter(predicate) : rows.slice();
    return limit != null ? out.slice(0, limit) : out;
  }

  count(table) { return this._read(table).length; }

  clear(table) {
    if (!TABLES.includes(table)) throw new Error(`unknown table ${table}`);
    this._cache.set(table, []);
    this._write(table);
  }

  static tables() { return TABLES.slice(); }
}

module.exports = { Store, TABLES };
