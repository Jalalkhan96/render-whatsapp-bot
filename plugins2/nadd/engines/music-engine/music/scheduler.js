'use strict';
/**
 * Sequential source queue. Processes external sources ONE BY ONE:
 *   SOURCE 1 -> complete -> normalize -> save -> cleanup -> SOURCE 2 ...
 * Concurrency is always 1 for external sources (MUSIC_CONCURRENT_SOURCES
 * is accepted but external calls are still serialized to protect RAM/disk).
 * Every source run is wrapped so one failing site can never crash the engine.
 */
const logger = require('./logger');
const health = require('./health-manager');

const CONCURRENT = parseInt(process.env.MUSIC_CONCURRENT_SOURCES || '1', 10);

async function runSource(source, taskFn, index, total) {
  const id = source.id || source.META?.id || 'unknown';
  const name = source.name || source.META?.name || id;
  const skip = health.shouldSkip(id);
  if (skip.skip) {
    logger.progress(index, total, name, 'SKIPPED', '(' + skip.reason + ')');
    return { sourceId: id, status: 'skipped', results: [], note: skip.reason };
  }
  const started = Date.now();
  let result;
  try {
    result = await taskFn(source);
  } catch (err) {
    logger.error(name, err);
    result = { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 200) };
  }
  const ms = Date.now() - started;
  const status = result && result.status ? result.status : 'ok';
  health.record(id, status, ms, result && result.note);

  const n = result && result.results ? result.results.length : 0;
  logger.progress(index, total, name, status.toUpperCase(), '(' + n + ' results, ' + ms + 'ms)');

  // cleanup: release references so GC can reclaim between sources
  result = null;
  if (global.gc) { try { global.gc(); } catch (e) { /* ignore */ } }
  return { sourceId: id, status, results: [], note: '' };
}

/**
 * Run sources sequentially. taskFn(source) must return
 * { status, results: [...normalized], note }. Results are collected
 * (capped) — raw HTTP bodies must already be released by the adapter.
 */
async function runSequential(sources, taskFn, opts = {}) {
  const list = (sources || []).filter(Boolean);
  const cap = opts.resultCap != null ? opts.resultCap : parseInt(process.env.MUSIC_MAX_RESULTS || '30', 10);
  const collected = [];
  const perSource = [];
  let i = 0;
  for (const source of list) {
    i++;
    const id = source.id || source.META?.id || 'unknown';
    const name = source.name || source.META?.name || id;
    const skip = health.shouldSkip(id);
    if (skip.skip) {
      logger.progress(i, list.length, name, 'SKIPPED', '(' + skip.reason + ')');
      perSource.push({ sourceId: id, status: 'skipped', count: 0 });
      continue;
    }
    const started = Date.now();
    let result;
    try {
      result = await taskFn(source);
    } catch (err) {
      logger.error(name, err);
      result = { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 200) };
    }
    const ms = Date.now() - started;
    const status = (result && result.status) || 'ok';
    health.record(id, status, ms, result && result.note);
    const items = (result && result.results) || [];
    perSource.push({ sourceId: id, status, count: items.length, ms });
    logger.progress(i, list.length, name, status.toUpperCase(), '(' + items.length + ' results, ' + ms + 'ms)');
    for (const it of items) {
      if (collected.length >= cap * 3) break; // hard memory cap before dedup
      collected.push(it);
    }
    // release per-source memory before moving on
    result = null;
    if (global.gc) { try { global.gc(); } catch (e) { /* ignore */ } }
  }
  return { results: collected, perSource };
}

module.exports = { runSequential, runSource, CONCURRENT };
