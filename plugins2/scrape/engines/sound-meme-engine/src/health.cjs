'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config.cjs');

function file(cwd) {
  const d = path.join(cwd || process.cwd(), config.cacheDirName);
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, 'health.json');
}

function load(cwd) {
  try { return JSON.parse(fs.readFileSync(file(cwd), 'utf8')); }
  catch { return {}; }
}

function save(state, cwd) {
  try { fs.writeFileSync(file(cwd), JSON.stringify(state, null, 2)); }
  catch { /* best-effort */ }
}

function record(name, ok, err, cwd) {
  const state = load(cwd);
  const prev = state[name] || { fails: 0, okCount: 0 };
  if (ok) {
    prev.fails = 0;
    prev.okCount += 1;
    prev.lastOk = new Date().toISOString();
  } else {
    prev.fails += 1;
    prev.lastErr = String((err && err.message) || err);
    prev.lastFail = new Date().toISOString();
  }
  prev.status = prev.fails >= 3 ? 'degraded' : (prev.fails > 0 ? 'flaky' : 'live');
  state[name] = prev;
  save(state, cwd);
  return prev;
}

function status(cwd) { return load(cwd); }

module.exports = { record, status };
