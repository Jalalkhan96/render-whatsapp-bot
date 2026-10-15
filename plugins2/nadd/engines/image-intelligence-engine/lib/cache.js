'use strict';
/** In-memory TTL cache for query+source result metadata. */

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    if (Date.now() > e.exp) { this.map.delete(key); this.misses++; return undefined; }
    this.hits++;
    return e.value;
  }
  set(key, value) {
    if (this.map.size >= 5000) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
    this.map.set(key, { value, exp: Date.now() + this.ttlMs });
  }
  clear() { this.map.clear(); this.hits = 0; this.misses = 0; }
  stats() { return { size: this.map.size, hits: this.hits, misses: this.misses, ttlMs: this.ttlMs }; }
}

function createCache() {
  return new TTLCache(envInt('IMAGE_SEARCH_CACHE_TTL', 21600) * 1000);
}

module.exports = { TTLCache, createCache };
