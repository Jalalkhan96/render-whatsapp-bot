'use strict';
/**
 * Compact structured logging. Console lines look like:
 *   [3/40] Genius SUCCESS (212ms)
 * Detailed errors go to a rotating file log (data/logs/music.log, ~200KB cap).
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'music.log');
const MAX_BYTES = 200 * 1024;

function ensureDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { /* ignore */ }
}

function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_BYTES) {
      const prev = LOG_FILE + '.1';
      try { fs.renameSync(LOG_FILE, prev); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* file may not exist */ }
}

function writeLine(line) {
  ensureDir();
  rotateIfNeeded();
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) { /* ignore */ }
}

function ts() {
  return new Date().toISOString();
}

/** Compact progress line for sequential source runs. */
function progress(index, total, sourceName, status, extra) {
  const line = '[' + index + '/' + total + '] ' + sourceName + ' ' + status + (extra ? ' ' + extra : '');
  // eslint-disable-next-line no-console
  console.log(line);
  writeLine(ts() + ' ' + line);
}

function info(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
  writeLine(ts() + ' INFO ' + msg);
}

function error(sourceName, err) {
  const detail = err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : String(err);
  writeLine(ts() + ' ERROR [' + sourceName + '] ' + detail);
}

module.exports = { progress, info, error };
