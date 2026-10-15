import { query, withTransaction } from '../database.js';

export async function getActiveConversation(userId, type = 'direct') {
  const result = await query(
    `SELECT * FROM conversations
     WHERE user_id = $1 AND type = $2 AND is_active = TRUE
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, type]
  );
  return result.rows[0] || null;
}

export async function createConversation(userId, type = 'direct', title = null) {
  return withTransaction(async (client) => {
    // Deactivate any existing active conversation of this type for the user.
    await client.query(
      `UPDATE conversations SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND type = $2 AND is_active = TRUE`,
      [userId, type]
    );
    const inserted = await client.query(
      `INSERT INTO conversations (user_id, type, title) VALUES ($1, $2, $3) RETURNING *`,
      [userId, type, title]
    );
    return inserted.rows[0];
  });
}

export async function getOrCreateActiveConversation(userId, type = 'direct') {
  const existing = await getActiveConversation(userId, type);
  if (existing) return existing;
  return createConversation(userId, type);
}

export async function touchConversation(conversationId) {
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
}

export async function clearConversation(userId, type = 'direct') {
  // "Clear" = start a brand new active conversation (old one preserved in history, deactivated).
  return createConversation(userId, type);
}
