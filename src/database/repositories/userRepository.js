import { query } from '../database.js';
import { config } from '../../config.js';

export async function findOrCreateUser(jid, name = null) {
  const existing = await query('SELECT * FROM users WHERE jid = $1', [jid]);
  if (existing.rows.length > 0) return existing.rows[0];

  const isAdmin = jid === config.admin.jid;
  const inserted = await query(
    `INSERT INTO users (jid, name, is_admin) VALUES ($1, $2, $3) RETURNING *`,
    [jid, name, isAdmin]
  );
  return inserted.rows[0];
}

export async function getUserByJid(jid) {
  const result = await query('SELECT * FROM users WHERE jid = $1', [jid]);
  return result.rows[0] || null;
}

export async function setBlocked(jid, blocked) {
  await query('UPDATE users SET is_blocked = $2, updated_at = NOW() WHERE jid = $1', [jid, blocked]);
}

/**
 * Atomically checks and increments the user's daily request counter.
 * Resets the counter if the stored reset date is not today.
 * Returns { allowed, remaining }.
 */
export async function tryConsumeDailyQuota(userId) {
  const result = await query(
    `UPDATE users
     SET
       daily_request_count = CASE
         WHEN daily_count_reset_at < CURRENT_DATE THEN 1
         ELSE daily_request_count + 1
       END,
       daily_count_reset_at = CURRENT_DATE,
       last_request_at = NOW(),
       updated_at = NOW()
     WHERE id = $1
     RETURNING daily_request_count`,
    [userId]
  );
  const count = result.rows[0]?.daily_request_count ?? 0;
  return {
    allowed: count <= config.limits.maxDailyRequests,
    remaining: Math.max(0, config.limits.maxDailyRequests - count),
    count,
  };
}

export async function getLastRequestAt(userId) {
  const result = await query('SELECT last_request_at FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.last_request_at || null;
}
