'use strict';
/* Deduplicator: provider+id is the identity. First occurrence wins. */

function dedup(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = r.provider + ':' + r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

module.exports = { dedup };
