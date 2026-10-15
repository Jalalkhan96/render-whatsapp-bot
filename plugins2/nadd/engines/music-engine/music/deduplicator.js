'use strict';
/**
 * Deduplication — keys in priority order:
 *   1. ISRC
 *   2. provider track id  (source:sourceId)
 *   3. canonical URL
 *   4. normalized title + normalized artist + duration bucket (+ version tags)
 * Version-distinct recordings (remix/live/acoustic/sped-up/...) are NEVER merged.
 */
const { normalize, splitVersion } = require('./query-normalizer');

function durationBucket(ms) {
  if (!ms) return 'x';
  return String(Math.round(ms / 5000)); // 5-second buckets
}

function dedupKey(t) {
  if (t.isrc) return 'isrc:' + String(t.isrc).toUpperCase();
  if (t.source && t.sourceId) return 'pid:' + t.source + ':' + String(t.sourceId);
  if (t.url) {
    try {
      const u = new URL(t.url);
      const clean = u.origin + u.pathname.replace(/\/$/, '').toLowerCase();
      return 'url:' + clean;
    } catch (e) { return 'url:' + String(t.url).toLowerCase(); }
  }
  const sv = splitVersion(t.title || '');
  const key = 'ta:' + normalize(sv.base) + '|' + normalize(t.artist || '') +
    '|' + durationBucket(t.durationMs) + '|' + sv.versions.slice().sort().join(',');
  return key;
}

/** Merge candidate lists from many providers into unique tracks. */
function deduplicate(tracks) {
  const seen = new Map();
  const out = [];
  for (const t of tracks || []) {
    if (!t || !t.title) continue;
    const key = dedupKey(t);
    if (seen.has(key)) {
      // merge source references + fill missing fields, keep first as canonical
      const prev = seen.get(key);
      prev.sources = prev.sources || [prev.source];
      if (t.source && !prev.sources.includes(t.source)) prev.sources.push(t.source);
      for (const f of ['album', 'durationMs', 'releaseDate', 'isrc', 'cover', 'genre', 'url']) {
        if (!prev[f] && t[f]) prev[f] = t[f];
      }
    } else {
      const copy = Object.assign({}, t);
      copy.sources = [t.source].filter(Boolean);
      seen.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

module.exports = { deduplicate, dedupKey, durationBucket };
