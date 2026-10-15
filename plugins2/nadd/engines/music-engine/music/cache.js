'use strict';
/**
 * File-backed TTL cache. Small entries only (metadata, ids, urls, availability).
 * Never caches private data or full copyrighted lyrics.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'cache.json');
const MAX_ENTRIES = 2000;

const TTLS = {
  track: parseInt(process.env.TRACK_CACHE_TTL || '86400', 10),
  lyrics: parseInt(process.env.LYRICS_CACHE_TTL || '21600', 10),
  chart: parseInt(process.env.CHART_CACHE_TTL || '3600', 10),
  trend: parseInt(process.env.TREND_CACHE_TTL || '1800', 10),
  artist: parseInt(process.env.ARTIST_CACHE_TTL || '86400', 10),
  album: parseInt(process.env.ALBUM_CACHE_TTL || '86400', 10),
};

let store = null;

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    store = {};
  }
  return store;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      // drop oldest-expire entries
      keys.sort((a, b) => (store[a].exp || 0) - (store[b].exp || 0));
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[k];
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
  } catch (e) { /* cache is best-effort */ }
}

function keyFor(ns, key) {
  const h = crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16);
  return ns + ':' + h;
}

function get(ns, key) {
  if (process.env.MUSIC_CACHE_ENABLED === 'false') return null;
  const s = load();
  const k = keyFor(ns, key);
  const e = s[k];
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { delete s[k]; return null; }
  return e.value;
}

function set(ns, key, value, ttlSec) {
  if (process.env.MUSIC_CACHE_ENABLED === 'false') return;
  const s = load();
  const ttl = ttlSec != null ? ttlSec : (TTLS[ns] || 3600);
  s[keyFor(ns, key)] = { value, exp: Date.now() + ttl * 1000, at: Date.now() };
  persist();
}

function del(ns, key) {
  const s = load();
  delete s[keyFor(ns, key)];
  persist();
}

/** Remove expired entries (disk cleanup). */
function prune() {
  const s = load();
  const now = Date.now();
  let n = 0;
  for (const k of Object.keys(s)) {
    if (s[k].exp && s[k].exp < now) { delete s[k]; n++; }
  }
  if (n) persist();
  return n;
}

module.exports = { get, set, del, prune, TTLS };
