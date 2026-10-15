'use strict';
/* Structured logger with daily file rotation (MASTER PROMPT §21). */
const fs = require('fs');
const path = require('path');
const config = require('./config.cjs');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const currentLevel = process.env.LOG_LEVEL && LEVELS[process.env.LOG_LEVEL.toUpperCase()]
  ? LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LEVELS.INFO;

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
ensureDir(config.logDir);

function logFile() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(config.logDir, `scrape100-${day}.log`);
}

/* Keep at most 14 log files (rotation). */
function rotate() {
  try {
    const files = fs.readdirSync(config.logDir)
      .filter(f => f.startsWith('scrape100-') && f.endsWith('.log')).sort();
    while (files.length > 14) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(config.logDir, old)); } catch (_) {}
    }
  } catch (_) {}
}
rotate();

function fmt(level, msg, fields) {
  const ts = new Date().toISOString();
  const kv = fields && Object.keys(fields).length
    ? ' ' + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  return `${ts} ${level} ${msg}${kv}`;
}

function write(level, msg, fields) {
  if (LEVELS[level] < currentLevel) return;
  const line = fmt(level, msg, fields);
  if (level === 'ERROR' || level === 'WARN' || process.env.LOG_STDOUT !== '0') {
    if (level === 'ERROR') console.error(line); else console.log(line);
  }
  try { fs.appendFileSync(logFile(), line + '\n'); } catch (_) {}
}

module.exports = {
  debug: (m, f) => write('DEBUG', m, f),
  info: (m, f) => write('INFO', m, f),
  warn: (m, f) => write('WARN', m, f),
  error: (m, f) => write('ERROR', m, f),
};
