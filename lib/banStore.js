const fs = require('fs');
const path = require('path');
const store = require('./lightweight_store');

const HAS_DB = Boolean(
  process.env.MONGO_URL ||
  process.env.POSTGRES_URL ||
  process.env.MYSQL_URL ||
  process.env.DB_URL
);
const bannedFilePath = path.join(process.cwd(), 'data', 'banned.json');

function normalizeUserId(value) {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  if (!raw) return '';
  const withoutDevice = raw.split(':')[0];
  return withoutDevice.replace(/@(s\.whatsapp\.net|lid|c\.us|g\.us)$/, '');
}

function sameUser(left, right) {
  const a = normalizeUserId(left);
  const b = normalizeUserId(right);
  return Boolean(a && b && a === b);
}

async function getBannedUsers() {
  if (HAS_DB) {
    const banned = await store.getSetting('global', 'banned');
    return Array.isArray(banned) ? banned : [];
  }
  if (!fs.existsSync(bannedFilePath)) return [];
  const banned = JSON.parse(fs.readFileSync(bannedFilePath, 'utf8'));
  return Array.isArray(banned) ? banned : [];
}

async function saveBannedUsers(bannedUsers) {
  const unique = [];
  for (const user of Array.isArray(bannedUsers) ? bannedUsers : []) {
    if (user && !unique.some(existing => sameUser(existing, user))) unique.push(user);
  }
  if (HAS_DB) {
    await store.saveSetting('global', 'banned', unique);
    return unique;
  }
  fs.mkdirSync(path.dirname(bannedFilePath), { recursive: true });
  fs.writeFileSync(bannedFilePath, JSON.stringify(unique, null, 2));
  return unique;
}

async function isBanned(userId) {
  const banned = await getBannedUsers();
  return banned.some(entry => sameUser(entry, userId));
}

async function removeBannedUser(userId) {
  const banned = await getBannedUsers();
  const remaining = banned.filter(entry => !sameUser(entry, userId));
  const removed = remaining.length !== banned.length;
  if (removed) await saveBannedUsers(remaining);
  return { removed, users: remaining };
}

module.exports = {
  HAS_DB,
  getBannedUsers,
  saveBannedUsers,
  isBanned,
  removeBannedUser,
  normalizeUserId,
  sameUser,
};
