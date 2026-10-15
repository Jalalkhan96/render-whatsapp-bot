'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.cjs');

function dir(cwd) {
  const d = path.join(cwd || process.cwd(), config.cacheDirName);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function key(query, sources, limit) {
  return crypto.createHash('sha1')
    .update(JSON.stringify({ query, sources, limit }))
    .digest('hex') + '.json';
}

function get(query, sources, limit, cwd) {
  const f = path.join(dir(cwd), key(query, sources, limit));
  if (!fs.existsSync(f)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - payload.savedAt > config.cacheTtlSec * 1000) return null;
    return payload.results;
  } catch {
    return null;
  }
}

function set(query, sources, limit, results, cwd) {
  try {
    fs.writeFileSync(
      path.join(dir(cwd), key(query, sources, limit)),
      JSON.stringify({ savedAt: Date.now(), results })
    );
  } catch { /* best-effort */ }
}

module.exports = { get, set };
