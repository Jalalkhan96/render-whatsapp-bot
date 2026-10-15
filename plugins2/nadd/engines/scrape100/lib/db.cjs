'use strict';
/* SQLite storage via the bot's existing better-sqlite3 dependency.
 * This keeps scrape100 compatible with the bot's Node 20 runtime and avoids
 * adding a second native SQLite dependency. */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config.cjs');
const log = require('./logger.cjs');
const { hashRecord } = require('./extract.cjs');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, name TEXT, country TEXT, category TEXT,
  base_url TEXT, transport TEXT, health TEXT DEFAULT 'healthy',
  last_successful_run TEXT, last_failure TEXT, failure_count INTEGER DEFAULT 0,
  avg_response_ms REAL DEFAULT 0, record_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS articles (
  canonical_url TEXT PRIMARY KEY, source TEXT, source_url TEXT, title TEXT,
  description TEXT, content TEXT, url TEXT, image TEXT, author TEXT,
  published_at TEXT, updated_at TEXT, country TEXT, language TEXT,
  category TEXT, tags TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS products (
  canonical_url TEXT PRIMARY KEY, source TEXT, source_url TEXT,
  title TEXT, price TEXT, currency TEXT, old_price TEXT, discount TEXT,
  availability TEXT, rating TEXT, reviews TEXT, image TEXT, brand TEXT,
  category_name TEXT, category TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS sports_events (
  canonical_url TEXT PRIMARY KEY, source TEXT, title TEXT, event TEXT,
  team1 TEXT, team2 TEXT, score TEXT, status TEXT, venue TEXT,
  start_time TEXT, url TEXT, category TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS finance_data (
  canonical_url TEXT PRIMARY KEY, source TEXT, symbol TEXT, name TEXT,
  price TEXT, change TEXT, change_percent TEXT, currency TEXT, volume TEXT,
  url TEXT, category TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS weather_data (
  canonical_url TEXT PRIMARY KEY, source TEXT, title TEXT, description TEXT,
  url TEXT, category TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS social_posts (
  canonical_url TEXT PRIMARY KEY, source TEXT, source_url TEXT, title TEXT,
  description TEXT, content TEXT, url TEXT, image TEXT, author TEXT,
  published_at TEXT, updated_at TEXT, country TEXT, language TEXT, category TEXT,
  tags TEXT, metadata TEXT, scraped_at TEXT, dedup_hash TEXT
);
CREATE TABLE IF NOT EXISTS scrape_runs (
  run_id TEXT PRIMARY KEY, started_at TEXT, finished_at TEXT,
  total_sites INTEGER, successful INTEGER, failed INTEGER, degraded INTEGER,
  records_found INTEGER, records_saved INTEGER, duplicates INTEGER
);
CREATE TABLE IF NOT EXISTS scrape_site_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, site TEXT, status TEXT,
  reason TEXT, records_found INTEGER, records_saved INTEGER, duplicates INTEGER,
  duration_ms INTEGER, started_at TEXT, finished_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, site TEXT, stage TEXT,
  message TEXT, at TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_src ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_cat ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_scraped ON articles(scraped_at);
CREATE INDEX IF NOT EXISTS idx_products_src ON products(source);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);
CREATE INDEX IF NOT EXISTS idx_sports_src ON sports_events(source);
CREATE INDEX IF NOT EXISTS idx_finance_src ON finance_data(source);
CREATE INDEX IF NOT EXISTS idx_weather_src ON weather_data(source);
CREATE INDEX IF NOT EXISTS idx_social_src ON social_posts(source);
CREATE INDEX IF NOT EXISTS idx_social_cat ON social_posts(category);
`;

function open() {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new Database(config.dbFile);
  db.exec(SCHEMA);
  log.info('db.open', { file: config.dbFile });
  return db;
}

function tableFor(record) {
  // Route by record shape first (a 'crypto' news article belongs in articles),
  // then by declared category.
  if (record.symbol) return 'finance_data';
  const c = record.category;
  if ((c === 'shopping' || c === 'electronics') && record.price !== undefined) return 'products';
  if (c === 'cricket' || c === 'sports') return 'sports_events';
  if (c === 'finance' || c === 'stock_market' || c === 'crypto' || c === 'economy') {
    return record.title && !record.symbol ? 'articles' : 'finance_data';
  }
  if (c === 'weather') return 'weather_data';
  if (c === 'social' || c === 'community' || c === 'trending') return 'social_posts';
  return 'articles';
}

/* undefined → null so SQLite binding never fails on missing optional fields. */
function v(x) { return x === undefined ? null : x; }

function dedupKey(record) {
  if (record.url) return record.url;
  return 'hash:' + hashRecord(`${record.source || ''}|${record.title || ''}|${record.publishedAt || ''}`);
}

/* Insert one normalized record. Returns 'saved' | 'duplicate'. */
function saveRecord(record) {
  const d = open();
  const table = tableFor(record);
  const key = dedupKey(record);
  const scrapedAt = v(record.scrapedAt) || new Date().toISOString();
  const meta = JSON.stringify(v(record.metadata) || {});
  const tags = JSON.stringify(v(record.tags) || []);
  try {
    if (table === 'articles' || table === 'social_posts') {
      d.prepare(`INSERT OR IGNORE INTO ${table}
        (canonical_url, source, source_url, title, description, content, url, image, author,
         published_at, updated_at, country, language, category, tags, metadata, scraped_at, dedup_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        v(key), v(record.source), v(record.sourceUrl), v(record.title), v(record.description), v(record.content),
        v(record.url), v(record.image), v(record.author), v(record.publishedAt), v(record.updatedAt) || '',
        v(record.country), v(record.language), v(record.category), table === 'articles' ? tags : '[]',
        v(meta), v(scrapedAt), key.startsWith('hash:') ? key : '');
    } else if (table === 'products') {
      d.prepare(`INSERT OR IGNORE INTO products
        (canonical_url, source, source_url, title, price, currency, old_price, discount,
         availability, rating, reviews, image, brand, category_name, category, metadata, scraped_at, dedup_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        v(key), v(record.source), v(record.sourceUrl), v(record.title), v(record.price), v(record.currency),
        v(record.oldPrice), v(record.discount), v(record.availability), v(record.rating), v(record.reviews),
        v(record.image), v(record.brand), v(record.categoryName), v(record.category), v(meta), v(scrapedAt),
        key.startsWith('hash:') ? key : '');
    } else if (table === 'sports_events') {
      d.prepare(`INSERT OR IGNORE INTO sports_events
        (canonical_url, source, title, event, team1, team2, score, status, venue,
         start_time, url, category, metadata, scraped_at, dedup_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        v(key), v(record.source), v(record.title), v(record.event), v(record.team1), v(record.team2),
        v(record.score), v(record.status), v(record.venue), v(record.startTime), v(record.url),
        v(record.category), v(meta), v(scrapedAt), key.startsWith('hash:') ? key : '');
    } else if (table === 'finance_data') {
      d.prepare(`INSERT OR IGNORE INTO finance_data
        (canonical_url, source, symbol, name, price, change, change_percent, currency,
         volume, url, category, metadata, scraped_at, dedup_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        v(key), v(record.source), v(record.symbol), v(record.name), v(record.price), v(record.change),
        v(record.changePercent), v(record.currency), v(record.volume), v(record.url),
        v(record.category), v(meta), v(scrapedAt), key.startsWith('hash:') ? key : '');
    } else if (table === 'weather_data') {
      d.prepare(`INSERT OR IGNORE INTO weather_data
        (canonical_url, source, title, description, url, category, metadata, scraped_at, dedup_hash)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        v(key), v(record.source), v(record.title), v(record.description), v(record.url),
        v(record.category), v(meta), v(scrapedAt), key.startsWith('hash:') ? key : '');
    }
    const ch = d.prepare('SELECT changes() AS c').get();
    return ch.c > 0 ? 'saved' : 'duplicate';
  } catch (err) {
    log.error('db.saveRecord', { table, err: err.message });
    throw err;
  }
}

function upsertSource(meta) {
  const d = open();
  d.prepare(`INSERT INTO sources (id, name, country, category, base_url, transport, health)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, country=excluded.country,
      category=excluded.category, base_url=excluded.base_url, transport=excluded.transport`).run(
    meta.id, meta.name, meta.country, meta.category, meta.baseUrl, meta.transport, meta.health || 'healthy');
}

function recordSourceRun(id, ok, responseMs, recordCount) {
  const d = open();
  const now = new Date().toISOString();
  if (ok) {
    d.prepare(`UPDATE sources SET health='healthy', last_successful_run=?, failure_count=0,
      avg_response_ms=?, record_count=record_count+? WHERE id=?`).run(now, responseMs, recordCount, id);
  } else {
    d.prepare(`UPDATE sources SET last_failure=?, failure_count=failure_count+1,
      health=CASE WHEN failure_count+1 >= 3 THEN 'degraded' ELSE health END WHERE id=?`).run(now, id);
  }
}

function insertRunSummary(s) {
  const d = open();
  d.prepare(`INSERT OR REPLACE INTO scrape_runs
    (run_id, started_at, finished_at, total_sites, successful, failed, degraded, records_found, records_saved, duplicates)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    s.runId, s.startedAt, s.finishedAt, s.totalSites, s.successful, s.failed,
    s.degraded, s.recordsFound, s.recordsSaved, s.duplicates);
}

function insertSiteRun(r) {
  const d = open();
  d.prepare(`INSERT INTO scrape_site_runs
    (run_id, site, status, reason, records_found, records_saved, duplicates, duration_ms, started_at, finished_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    r.runId, r.site, r.status, r.reason || '', r.recordsFound, r.recordsSaved,
    r.duplicates, r.durationMs, r.startedAt, r.finishedAt);
}

function insertError(runId, site, stage, message) {
  const d = open();
  d.prepare('INSERT INTO scrape_errors (run_id, site, stage, message, at) VALUES (?,?,?,?,?)')
    .run(runId, site, stage, String(message).slice(0, 2000), new Date().toISOString());
}

function query(sql, params = []) {
  return open().prepare(sql).all(...params);
}

function close() { if (db) { try { db.close(); } catch (_) {} db = null; } }

module.exports = {
  open, tableFor, dedupKey, saveRecord, upsertSource, recordSourceRun,
  insertRunSummary, insertSiteRun, insertError, query, close,
};
