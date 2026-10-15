'use strict';

const store = require('./lightweight_store');
const KEY = 'adminOnlyGroups';
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

async function getGroups() {
  const value = await store.getSetting('global', KEY);
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

async function isEnabled(chatId) {
  chatId = String(chatId || '');
  if (!chatId.endsWith('@g.us')) return false;
  const cached = cache.get(chatId);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  const groups = await getGroups();
  const enabled = groups.includes(chatId);
  cache.set(chatId, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return enabled;
}

async function setEnabled(chatId, enabled) {
  chatId = String(chatId || '');
  if (!chatId.endsWith('@g.us')) return false;
  const groups = await getGroups();
  const next = new Set(groups);
  if (enabled) next.add(chatId); else next.delete(chatId);
  await store.saveSetting('global', KEY, [...next]);
  cache.set(chatId, { enabled: Boolean(enabled), expiresAt: Date.now() + CACHE_TTL_MS });
  return true;
}

module.exports = { getGroups, isEnabled, setEnabled };
