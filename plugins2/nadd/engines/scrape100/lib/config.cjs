'use strict';
/* Central configuration. Every limit from env with sane defaults (MASTER PROMPT §16). */
const path = require('path');

function num(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

const ROOT = path.resolve(__dirname, '..');

const config = {
  root: ROOT,
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  logDir: process.env.LOG_DIR || path.join(ROOT, 'logs'),
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'scrape100.db'),

  maxResultsPerSite: num('MAX_RESULTS_PER_SITE', 50),
  maxPagesPerSite: num('MAX_PAGES_PER_SITE', 5),
  requestTimeoutMs: num('REQUEST_TIMEOUT', 30000),
  maxRetries: num('MAX_RETRIES', 3),
  maxResponseSizeMb: num('MAX_RESPONSE_SIZE_MB', 5),
  defaultDelayMs: num('DEFAULT_REQUEST_DELAY_MS', 1000),
  debug: process.env.DEBUG === '1',

  userAgent: process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

module.exports = config;
