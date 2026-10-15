'use strict';
/**
 * Health tracking per source:
 *   healthy | degraded | timeout | blocked | changed | auth_required | disabled
 * Tracks lastSuccess, lastFailure, failureCount, averageResponseTime, lastStatus.
 * Persisted to data/health.json; circuit-breaks sources after 5 straight failures.
 */
const fs = require('fs');
const path = require('path');

const HEALTH_FILE = path.join(__dirname, '..', 'data', 'health.json');
const CIRCUIT_BREAK_AFTER = 5;
const CIRCUIT_COOLDOWN_MS = 30 * 60 * 1000;

let health = null;

function load() {
  if (health) return health;
  try { health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')); }
  catch (e) { health = {}; }
  return health;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(HEALTH_FILE), { recursive: true });
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 1));
  } catch (e) { /* best-effort */ }
}

function entry(id) {
  const h = load();
  if (!h[id]) {
    h[id] = {
      status: 'healthy', lastSuccess: null, lastFailure: null,
      failureCount: 0, successCount: 0, avgMs: null, lastStatus: null, note: '',
    };
  }
  return h[id];
}

/** Record one completed source run. status: ok|auth_required|source_changed|blocked|timeout|error|disabled */
function record(id, status, ms, note) {
  const e = entry(id);
  const now = new Date().toISOString();
  e.lastStatus = status;
  e.note = note || '';
  if (ms != null) e.avgMs = e.avgMs == null ? Math.round(ms) : Math.round(e.avgMs * 0.7 + ms * 0.3);
  if (status === 'ok') {
    e.status = e.failureCount > 0 ? 'degraded' : 'healthy';
    e.lastSuccess = now;
    e.failureCount = 0;
    e.successCount++;
  } else if (status === 'auth_required') {
    e.status = 'auth_required';
    e.failureCount++;
    e.lastFailure = now;
  } else if (status === 'source_changed') {
    e.status = 'changed';
    e.failureCount++;
    e.lastFailure = now;
  } else if (status === 'blocked') {
    e.status = 'blocked';
    e.failureCount++;
    e.lastFailure = now;
  } else if (status === 'disabled') {
    e.status = 'disabled';
  } else if (status === 'unsupported' || status === 'ok-empty' || status === 'skipped') {
    // not a failure — the source works, it just has nothing for this query
    if (e.status !== 'auth_required' && e.status !== 'disabled' && e.status !== 'blocked' && e.status !== 'changed') {
      e.status = e.failureCount > 0 ? 'degraded' : 'healthy';
    }
  } else {
    // timeout / error
    e.status = status === 'timeout' ? 'timeout' : (e.failureCount >= 2 ? 'degraded' : 'healthy');
    e.failureCount++;
    e.lastFailure = now;
  }
  persist();
  return e;
}

/** Should the scheduler skip this source right now? (circuit breaker) */
function shouldSkip(id) {
  const e = entry(id);
  if (e.status === 'disabled' || e.status === 'auth_required') return { skip: true, reason: e.status };
  if (e.failureCount >= CIRCUIT_BREAK_AFTER && e.lastFailure) {
    const since = Date.now() - new Date(e.lastFailure).getTime();
    if (since < CIRCUIT_COOLDOWN_MS) return { skip: true, reason: 'circuit_breaker_cooldown' };
  }
  return { skip: false };
}

function get(id) { return entry(id); }
function list() { return load(); }
function disable(id, note) { const e = entry(id); e.status = 'disabled'; e.note = note || ''; persist(); }
function enable(id) { const e = entry(id); e.status = 'healthy'; e.failureCount = 0; e.note = ''; persist(); }

module.exports = { record, shouldSkip, get, list, disable, enable };
