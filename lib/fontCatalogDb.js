'use strict';

/** Direct Turso/libSQL access shared by the legacy -font commands and catalog commands. */
const DEFAULT_TABLE = 'fonts';
const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 10;
let dbClient = null;
const selections = new Map();

const SOURCES = [
  { key: 'dafont', label: 'DaFont', command: 'dafontdb', shortCommand: 'dafont', terms: ['dafont'] },
  { key: 'google-fonts', label: 'Google Fonts', command: 'googlefontsdb', shortCommand: 'gfonts', terms: ['google', 'gfonts'] },
  { key: 'fontshare', label: 'Fontshare', command: 'fontsharedb', shortCommand: 'fontshare', terms: ['fontshare'] },
  { key: 'font-squirrel', label: 'Font Squirrel', command: 'fontsquirreldb', shortCommand: 'fontsquirrel', terms: ['squirrel', 'fontsquirrel'] },
  { key: '1001-free-fonts', label: '1001 Free Fonts', command: 'freefontsdb', shortCommand: 'freefonts', terms: ['1001', 'freefont', 'freefonts'] },
  { key: 'abstractfonts', label: 'Abstract Fonts', command: 'abstractfontsdb', shortCommand: 'abstractfonts', terms: ['abstractfont', 'abstractfonts'] },
  { key: 'fontspace', label: 'FontSpace', command: 'fontspacedb', shortCommand: 'fontspace', terms: ['fontspace'] },
  { key: 'urbanfonts', label: 'Urban Fonts', command: 'urbanfontsdb', shortCommand: 'urbanfonts', terms: ['urbanfont', 'urbanfonts'] },
  { key: 'wfonts', label: 'WFonts', command: 'wfontsdb', shortCommand: 'wfonts', terms: ['wfonts'] },
];

const LANGUAGE_TERMS = {
  urdu: ['urdu', 'nastaliq', 'nafees', 'jameel', 'naskh', 'pdms', 'mehr'],
  pashto: ['pashto', 'urdu', 'nastaliq', 'naskh', 'arabic'],
  arabic: ['arabic', 'arab', 'kufi', 'nastaliq', 'naskh', 'lateef', 'amiri', 'scheherazade'],
  persian: ['persian', 'farsi', 'vazirmatn', 'arabic', 'naskh'],
  farsi: ['persian', 'farsi', 'vazirmatn', 'arabic', 'naskh'],
  chinese: ['chinese', 'cjk', 'han'],
  japanese: ['japanese', 'japan', 'cjk', 'kana'],
  russian: ['russian', 'cyrillic'],
  greek: ['greek'],
  hindi: ['hindi', 'devanagari'],
  bengali: ['bengali'],
  punjabi: ['punjabi', 'nastaliq', 'urdu'],
  english: ['latin', 'english'],
};

const LICENSE_TERMS = {
  free: ['free', 'public domain', 'open font license', 'ofl', 'gpl'],
  personal: ['personal'],
  pd: ['public domain', 'ofl', 'gpl', 'open font license'],
  donation: ['donation'],
  shareware: ['shareware'],
  demo: ['demo'],
};

function clean(value, fallback = '') {
  const out = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return out || fallback;
}

function safeTable() {
  const name = clean(process.env.TURSO_FONTS_TABLE, DEFAULT_TABLE);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    const error = new Error('TURSO_FONTS_TABLE must be a simple table name, such as fonts.');
    error.code = 'FONT_CATALOG_SCHEMA';
    throw error;
  }
  return name;
}

function getDB() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    const error = new Error('Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env, then restart the bot.');
    error.code = 'FONT_CATALOG_CONFIG';
    throw error;
  }
  if (!dbClient) {
    let createClient;
    try { ({ createClient } = require('@libsql/client')); }
    catch (cause) {
      const error = new Error('Missing @libsql/client. Run npm install in the bot directory.');
      error.code = 'FONT_CATALOG_DEPENDENCY';
      error.cause = cause;
      throw error;
    }
    dbClient = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return dbClient;
}

function sourceByName(value) {
  const key = clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  return SOURCES.find(source => [source.key, source.label, source.command, source.shortCommand, ...source.terms]
    .some(candidate => String(candidate).toLowerCase().replace(/[^a-z0-9]/g, '') === key)) ||
    SOURCES.find(source => source.key.replace(/[^a-z0-9]/g, '').includes(key) && key.length >= 4) || null;
}

function addContainsGroup(clauses, params, columnExpressions, terms) {
  const normalized = [...new Set((terms || []).map(term => clean(term).toLowerCase()).filter(Boolean))];
  if (!normalized.length) return;
  const group = [];
  for (const term of normalized) {
    const like = `%${term}%`;
    for (const col of columnExpressions) {
      group.push(`LOWER(COALESCE(${col}, '')) LIKE ?`);
      params.push(like);
    }
  }
  if (group.length) clauses.push(`(${group.join(' OR ')})`);
}

function makeWhere(filters = {}) {
  const clauses = [];
  const args = [];
  const query = clean(filters.query).slice(0, MAX_QUERY_LENGTH).toLowerCase();
  if (query) addContainsGroup(clauses, args, ['name', 'author', 'category', 'license'], [query]);

  if (filters.source) {
    const source = typeof filters.source === 'string' ? sourceByName(filters.source) : filters.source;
    if (source) addContainsGroup(clauses, args, ['source'], source.terms);
    else addContainsGroup(clauses, args, ['source'], [clean(filters.source)]);
  }

  if (filters.category) addContainsGroup(clauses, args, ['category', 'name'], [filters.category]);
  if (filters.license) {
    const raw = clean(filters.license).toLowerCase().replace(/[^a-z]+/g, '');
    const terms = LICENSE_TERMS[raw] || [clean(filters.license)];
    addContainsGroup(clauses, args, ['license'], terms);
  }
  if (filters.language) {
    const language = clean(filters.language).toLowerCase();
    const terms = LANGUAGE_TERMS[language] || [language];
    addContainsGroup(clauses, args, ['name', 'category'], terms);
  }
  if (filters.urduOnly) addContainsGroup(clauses, args, ['name', 'category'], LANGUAGE_TERMS.urdu);
  if (filters.downloadableOnly) clauses.push(`TRIM(COALESCE(download_url, '')) <> ''`);

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', args, query };
}

const SELECT_COLUMNS = 'id, name, author, license, category, url, download_url, source';

async function queryFonts(filters = {}) {
  const db = getDB();
  const table = safeTable();
  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || MAX_RESULTS, 1), 20);
  const where = makeWhere(filters);
  const counted = await db.execute({ sql: `SELECT COUNT(*) AS total FROM "${table}" ${where.sql}`, args: where.args });
  const total = Number(counted.rows?.[0]?.total || 0);
  if (!total) return { rows: [], total: 0, limit };

  let offset = Math.max(0, Number.parseInt(filters.offset, 10) || 0);
  let order = `CASE WHEN LOWER(COALESCE(name, '')) = ? THEN 0 WHEN LOWER(COALESCE(name, '')) LIKE ? THEN 1 ELSE 2 END, name COLLATE NOCASE ASC, id ASC`;
  let args = [...where.args, where.query, `${where.query}%`];
  if (filters.random) {
    // True random samples; a random offset over ID ordering often clusters one import/source.
    offset = 0;
    order = 'RANDOM()';
    args = [...where.args];
  }
  const result = await db.execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM "${table}" ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });
  return { rows: result.rows || [], total, limit, offset };
}

async function getFontById(id) {
  const db = getDB();
  const table = safeTable();
  const result = await db.execute({ sql: `SELECT ${SELECT_COLUMNS} FROM "${table}" WHERE id = ? LIMIT 1`, args: [id] });
  return result.rows?.[0] || null;
}

async function getFontByName(name, filters = {}) {
  const query = clean(name).slice(0, MAX_QUERY_LENGTH);
  if (!query) return null;
  const result = await queryFonts({ ...filters, query, limit: 10 });
  const lower = query.toLowerCase();
  return result.rows.find(row => clean(row.name).toLowerCase() === lower) ||
    result.rows.find(row => clean(row.name).toLowerCase().startsWith(lower)) ||
    result.rows[0] || null;
}

async function getTypes(limit = 40) {
  const db = getDB();
  const table = safeTable();
  const result = await db.execute({
    sql: `SELECT category, COUNT(*) AS total FROM "${table}" WHERE TRIM(COALESCE(category, '')) <> '' GROUP BY category ORDER BY total DESC, category COLLATE NOCASE ASC LIMIT ?`,
    args: [Math.min(Math.max(Number(limit) || 40, 1), 60)],
  });
  return result.rows || [];
}

async function getStats() {
  const db = getDB();
  const table = safeTable();
  const summary = await db.execute({
    sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN TRIM(COALESCE(download_url, '')) <> '' THEN 1 ELSE 0 END) AS downloadable FROM "${table}"`,
    args: [],
  });
  const grouped = await db.execute({
    sql: `SELECT source, COUNT(*) AS total, SUM(CASE WHEN TRIM(COALESCE(download_url, '')) <> '' THEN 1 ELSE 0 END) AS downloadable FROM "${table}" GROUP BY source ORDER BY total DESC`,
    args: [],
  });
  return {
    total: Number(summary.rows?.[0]?.total || 0),
    downloadable: Number(summary.rows?.[0]?.downloadable || 0),
    sources: (grouped.rows || []).map(row => ({ source: clean(row.source, 'Unknown'), total: Number(row.total || 0), downloadable: Number(row.downloadable || 0) })),
  };
}

function selectionKey(message, context = {}) {
  return context?.chatId || message?.key?.remoteJid || 'global';
}
function rememberSelection(message, context, rows) {
  selections.set(selectionKey(message, context), { at: Date.now(), rows: Array.isArray(rows) ? rows.slice(0, 20) : [] });
}
function getSelection(message, context = {}) {
  const key = selectionKey(message, context);
  const item = selections.get(key);
  if (!item) return [];
  if (Date.now() - item.at > 30 * 60 * 1000) { selections.delete(key); return []; }
  return item.rows;
}

function safeUrl(raw) {
  const value = clean(raw);
  if (!value || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch { return ''; }
}

function sourceLabel(value) {
  const source = sourceByName(value) || SOURCES.find(item => item.terms.some(term => clean(value).toLowerCase().includes(term)));
  return source?.label || clean(value, 'Unknown source');
}

function displayRow(row, index) {
  return {
    id: clean(row?.id, '?'),
    name: clean(row?.name, 'Unnamed font'),
    author: clean(row?.author, 'Unknown'),
    license: clean(row?.license, 'Not specified'),
    category: clean(row?.category, 'Uncategorized'),
    source: sourceLabel(row?.source),
    pageUrl: safeUrl(row?.url),
    downloadUrl: safeUrl(row?.download_url),
    index,
  };
}

function errorMessage(error) {
  if (error?.code === 'FONT_CATALOG_CONFIG') return '❌ Font database is not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to the bot .env, then restart ABIX.';
  if (error?.code === 'FONT_CATALOG_DEPENDENCY') return '❌ Missing @libsql/client. Run npm install in the bot folder and restart ABIX.';
  const raw = String(error?.message || '').toLowerCase();
  if (raw.includes('no such table') || raw.includes('no such column') || raw.includes('does not exist')) {
    return `❌ Font database schema mismatch. Table "${clean(process.env.TURSO_FONTS_TABLE, DEFAULT_TABLE)}" must have id, name, author, license, category, url, download_url, source columns.`;
  }
  console.error('[FONT DATABASE]', error?.message || error);
  return '❌ Font database lookup failed. Check Turso credentials, table/column names, and connection.';
}

module.exports = {
  SOURCES, LANGUAGE_TERMS, LICENSE_TERMS, clean, sourceByName, queryFonts, getFontById, getFontByName,
  getTypes, getStats, rememberSelection, getSelection, safeUrl, sourceLabel, displayRow, errorMessage,
  _test: { makeWhere, safeTable, sourceByName, sourceLabel },
};
