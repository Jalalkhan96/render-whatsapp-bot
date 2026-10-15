'use strict';

/**
 * cache.cjs — tiny JSON disk cache (TTL) so repeated searches don't
 * re-hit the sources. Bypass with { noCache: true }.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.cjs');

function dir(cwd) {
  const d = path.join(cwd || process.cwd(), config.cacheDirName);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function key(query, sources, limit, nsfw) {
  return crypto.createHash('sha1')
    .update(JSON.stringify({ query, sources, limit, nsfw }))
    .digest('hex') + '.json';
}

function get(query, sources, limit, nsfw, cwd) {
  const f = path.join(dir(cwd), key(query, sources, limit, nsfw));
  if (!fs.existsSync(f)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - payload.savedAt > config.cacheTtlSec * 1000) return null;
    return payload.results;
  } catch {
    return null;
  }
}

function set(query, sources, limit, nsfw, results, cwd) {
  try {
    const f = path.join(dir(cwd), key(query, sources, limit, nsfw));
    fs.writeFileSync(f, JSON.stringify({ savedAt: Date.now(), results }));
  } catch {
    // cache is best-effort; never fail a search over it
  }
}

module.exports = { get, set };
