'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./lightweight_store');

const ROOT = process.cwd();
const STORE_FILE = path.join(ROOT, 'baileys_store.json');
const MESSAGE_COUNT_FILE = path.join(ROOT, 'data', 'messageCount.json');

const AUTO_ENABLED = !['0', 'false', 'off', 'no'].includes(
  String(process.env.STORAGE_AUTO_CLEAR_ENABLED || 'true').trim().toLowerCase()
);
const INTERVAL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.STORAGE_AUTO_CLEAR_INTERVAL_MS) || 30 * 60 * 1000
);
const MAX_STORE_MB = Math.max(5, Number(process.env.STORAGE_MAX_FILE_MB) || 32);
const MAX_STORE_BYTES = MAX_STORE_MB * 1024 * 1024;
const TEMP_MAX_AGE_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.STORAGE_TEMP_MAX_AGE_MS) || 3 * 60 * 60 * 1000
);

const GLOBAL_KEY = Symbol.for('abix.storageMaintenance.state');
const TEMP_DIRS = [
  path.join(os.tmpdir(), 'abix-gdl'),
  path.join(os.tmpdir(), 'abix-bgr'),
  path.join(os.tmpdir(), 'abix-sticker'),
  path.join(os.tmpdir(), 'abix-media'),
  path.join(ROOT, 'tmp'),
  path.join(ROOT, 'temp'),
];

function fileSize(file) {
  try { return fs.existsSync(file) ? fs.statSync(file).size : 0; } catch { return 0; }
}

function safeStat(file) {
  try { return fs.statSync(file); } catch { return null; }
}

function cleanDirectory(dir, { olderThanMs = TEMP_MAX_AGE_MS, force = false } = {}) {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };

  let names;
  try { names = fs.readdirSync(dir); } catch { return { files, bytes }; }
  const now = Date.now();

  for (const name of names) {
    const full = path.join(dir, name);
    const stat = safeStat(full);
    if (!stat) continue;
    const stale = force || (now - stat.mtimeMs >= olderThanMs);
    if (!stale) continue;

    try {
      if (stat.isFile()) bytes += stat.size || 0;
      fs.rmSync(full, { recursive: true, force: true });
      files++;
    } catch {}
  }
  return { files, bytes };
}

async function persist() {
  try {
    if (typeof store.cleanupData === 'function') store.cleanupData();
    if (typeof store.writeToFile === 'function') await store.writeToFile();
  } catch (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

function stats() {
  const info = typeof store.getStats === 'function' ? store.getStats() : {};
  const storeBytes = fileSize(STORE_FILE);
  const countBytes = fileSize(MESSAGE_COUNT_FILE);
  const mem = process.memoryUsage();
  return {
    ...info,
    storeBytes,
    storeMB: Number((storeBytes / 1024 / 1024).toFixed(2)),
    messageCountBytes: countBytes,
    messageCountMB: Number((countBytes / 1024 / 1024).toFixed(2)),
    heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
    rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
    autoClearEnabled: AUTO_ENABLED,
    autoClearIntervalMs: INTERVAL_MS,
    maxStoreFileMB: MAX_STORE_MB,
  };
}

async function clearMessageCache({ full = false, forceTemp = true, reason = 'manual' } = {}) {
  const before = stats();

  // `messages` is a local cache used for quoted-message lookup. Clearing it
  // does not touch Baileys authentication/session data.
  store.messages = {};

  if (full) {
    store.contacts = {};
    store.chats = {};
    store.messageCount = {};
  }

  const persisted = await persist();

  if (full) {
    try {
      if (fs.existsSync(MESSAGE_COUNT_FILE)) fs.rmSync(MESSAGE_COUNT_FILE, { force: true });
    } catch {}
  }

  let tempFiles = 0;
  let tempBytes = 0;
  for (const dir of TEMP_DIRS) {
    const result = cleanDirectory(dir, { force: forceTemp });
    tempFiles += result.files;
    tempBytes += result.bytes;
  }

  if (typeof global.gc === 'function') {
    try { global.gc(); } catch {}
  }

  const after = stats();
  return {
    success: persisted.success,
    reason,
    full,
    before,
    after,
    tempFiles,
    tempBytes,
    persisted,
  };
}

async function autoCleanup() {
  try {
    // First trim each chat to the store's configured message ceiling.
    if (typeof store.cleanupData === 'function') store.cleanupData();

    const current = stats();
    const emergency = current.storeBytes >= MAX_STORE_BYTES;

    if (emergency) {
      console.log(`[STORE-SAFETY] baileys_store.json is ${current.storeMB} MB; clearing message cache (limit ${MAX_STORE_MB} MB).`);
      await clearMessageCache({ full: false, forceTemp: false, reason: 'automatic-size-limit' });
    } else {
      await persist();
    }

    // Temp media is disposable; only old files are removed automatically.
    let removed = 0;
    let bytes = 0;
    for (const dir of TEMP_DIRS) {
      const result = cleanDirectory(dir);
      removed += result.files;
      bytes += result.bytes;
    }
    if (removed) {
      console.log(`[STORE-SAFETY] Removed ${removed} stale temp files (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
    }
  } catch (error) {
    console.error('[STORE-SAFETY] Automatic cleanup failed:', error.message);
  }
}

function start() {
  const state = globalThis[GLOBAL_KEY] || (globalThis[GLOBAL_KEY] = { timer: null, started: false });
  if (!AUTO_ENABLED || state.timer) return;

  // Startup check after the store has loaded its file. The global guard keeps
  // hot-reload/plugin reloads from creating duplicate cleanup timers.
  const startupTimer = setTimeout(() => { autoCleanup(); }, 20 * 1000);
  startupTimer.unref?.();
  state.timer = setInterval(autoCleanup, INTERVAL_MS);
  state.timer.unref?.();
  state.started = true;
  console.log(`[STORE-SAFETY] Auto-clear enabled: every ${Math.round(INTERVAL_MS / 60000)} min; max store file ${MAX_STORE_MB} MB.`);
}

start();

module.exports = {
  clearMessageCache,
  autoCleanup,
  stats,
  start,
  config: {
    autoEnabled: AUTO_ENABLED,
    intervalMs: INTERVAL_MS,
    maxStoreMB: MAX_STORE_MB,
    tempMaxAgeMs: TEMP_MAX_AGE_MS,
  },
};
