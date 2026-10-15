import { query } from '../database.js';

const cache = new Map();

export async function getSetting(key, fallback = null) {
  if (cache.has(key)) return cache.get(key);
  const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
  const value = result.rows[0]?.value ?? fallback;
  cache.set(key, value);
  return value;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
  cache.set(key, String(value));
}

export function invalidateSettingsCache() {
  cache.clear();
}
