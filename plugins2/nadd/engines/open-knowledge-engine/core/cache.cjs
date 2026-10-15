/*
 * core/cache.cjs — query/source/result caching (§17).
 *
 * In-memory LRU-ish map + JSON file persistence. Default TTL 21600s
 * (KNOWLEDGE_CACHE_TTL env override, seconds). Rapidly-changing metadata
 * can pass a shorter ttl per entry.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function defaultTtlSec() {
  const v = process.env.KNOWLEDGE_CACHE_TTL ? Number(process.env.KNOWLEDGE_CACHE_TTL) : 21600;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 21600;
}

class Cache {
  constructor(opts) {
    opts = opts || {};
    this.file = opts.file || null;
    this.maxEntries = opts.maxEntries || 500;
    this.map = new Map();
    if (this.file) this._load();
  }

  _key(namespace, key) { return `${namespace}:${key}`; }

  _load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = JSON.parse(raw);
      const now = Date.now();
      for (const [k, v] of Object.entries(data || {})) {
        if (v && v.expiresAt > now) this.map.set(k, v);
      }
    } catch (_) { /* corrupt cache -> start empty */ }
  }

  _persist() {
    if (!this.file) return;
    try {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.map) obj[k] = v;
      fs.writeFileSync(this.file, JSON.stringify(obj).slice(0, 50 * 1024 * 1024), 'utf8');
    } catch (_) { /* best effort */ }
  }

  get(namespace, key) {
    const k = this._key(namespace, key);
    const v = this.map.get(k);
    if (!v) return null;
    if (v.expiresAt <= Date.now()) { this.map.delete(k); return null; }
    return v.value;
  }

  set(namespace, key, value, ttlSec) {
    const ttl = ttlSec != null ? ttlSec : defaultTtlSec();
    const k = this._key(namespace, key);
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
    this.map.set(k, { value, expiresAt: Date.now() + ttl * 1000, storedAt: new Date().toISOString() });
    this._persist();
    return true;
  }

  invalidate(namespace, key) { this.map.delete(this._key(namespace, key)); this._persist(); }
  clear() { this.map.clear(); this._persist(); }
  size() { return this.map.size; }
}

module.exports = { Cache, defaultTtlSec };
