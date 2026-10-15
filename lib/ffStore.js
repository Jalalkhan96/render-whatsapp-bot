const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WISHLIST_FILE = path.join(DATA_DIR, 'ff_wishlist.json');
const LINKED_FILE = path.join(DATA_DIR, 'ff_linked.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file) {
  ensureDir();
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeId(userId) {
  return String(userId || '').replace(/[^0-9]/g, '');
}

function getWishlist(userId) {
  const id = normalizeId(userId);
  const db = readJson(WISHLIST_FILE);
  return db[id] || [];
}

function addWish(userId, item) {
  const id = normalizeId(userId);
  const db = readJson(WISHLIST_FILE);
  const list = db[id] || [];
  const clean = String(item || '').trim();
  if (clean.length > 100) throw new Error('Item name too long (max 100 chars).');
  if (list.length >= 25) throw new Error('Wishlist full! Max 25 items.');
  if (list.some(i => i.toLowerCase() === clean.toLowerCase())) return { added: false, reason: 'already' };
  list.push(clean);
  db[id] = list;
  writeJson(WISHLIST_FILE, db);
  return { added: true, total: list.length };
}

function removeWish(userId, item) {
  const id = normalizeId(userId);
  const db = readJson(WISHLIST_FILE);
  const list = db[id] || [];
  const clean = String(item || '').trim();
  let removed = null;
  if (/^\d+$/.test(clean)) {
    const idx = parseInt(clean, 10) - 1;
    if (idx >= 0 && idx < list.length) removed = list.splice(idx, 1)[0];
  } else {
    const idx = list.findIndex(i => i.toLowerCase() === clean.toLowerCase());
    if (idx !== -1) removed = list.splice(idx, 1)[0];
  }
  if (removed === null) return { removed: false };
  db[id] = list;
  writeJson(WISHLIST_FILE, db);
  return { removed: true, item: removed, total: list.length };
}

function clearWishlist(userId) {
  const id = normalizeId(userId);
  const db = readJson(WISHLIST_FILE);
  const count = (db[id] || []).length;
  db[id] = [];
  writeJson(WISHLIST_FILE, db);
  return count;
}

function linkUid(userId, uid) {
  const id = normalizeId(userId);
  const db = readJson(LINKED_FILE);
  const clean = String(uid || '').trim();
  db[id] = clean;
  writeJson(LINKED_FILE, db);
  return clean;
}

function unlinkUid(userId) {
  const id = normalizeId(userId);
  const db = readJson(LINKED_FILE);
  const prev = db[id] || null;
  delete db[id];
  writeJson(LINKED_FILE, db);
  return prev;
}

function getLinkedUid(userId) {
  const id = normalizeId(userId);
  const db = readJson(LINKED_FILE);
  return db[id] || null;
}

module.exports = {
  dataDir: DATA_DIR,
  getWishlist,
  addWish,
  removeWish,
  clearWishlist,
  linkUid,
  unlinkUid,
  getLinkedUid
};