'use strict';
/* Health tracker: per-site health state (healthy/degraded/timeout/blocked/
 * changed/disabled), persisted in the sources table. (MASTER PROMPT §30) */
const db = require('./db.cjs');
const log = require('./logger.cjs');

const STATES = ['healthy', 'degraded', 'timeout', 'blocked', 'changed', 'disabled'];

function setHealth(id, state, reason) {
  if (!STATES.includes(state)) state = 'degraded';
  const d = db.open();
  d.prepare('UPDATE sources SET health=? WHERE id=?').run(state, id);
  if (reason) log.warn('health.set', { site: id, state, reason: String(reason).slice(0, 120) });
}

function getHealth(id) {
  const rows = db.query('SELECT id, name, health, last_successful_run, last_failure, failure_count, avg_response_ms, record_count FROM sources WHERE id=?', [id]);
  return rows[0] || null;
}

function allHealth() {
  return db.query('SELECT id, name, health, last_successful_run, last_failure, failure_count, avg_response_ms, record_count FROM sources ORDER BY id');
}

function markDisabled(id, reason) { setHealth(id, 'disabled', reason); }

module.exports = { STATES, setHealth, getHealth, allHealth, markDisabled };
