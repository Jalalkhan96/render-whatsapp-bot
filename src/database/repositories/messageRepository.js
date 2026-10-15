import { query } from '../database.js';

export async function messageExists(whatsappMessageId) {
  if (!whatsappMessageId) return false;
  const result = await query('SELECT 1 FROM messages WHERE whatsapp_message_id = $1', [
    whatsappMessageId,
  ]);
  return result.rows.length > 0;
}

export async function saveMessage({
  conversationId,
  whatsappMessageId = null,
  role,
  content,
  metadata = {},
}) {
  try {
    const result = await query(
      `INSERT INTO messages (conversation_id, whatsapp_message_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [conversationId, whatsappMessageId, role, content, JSON.stringify(metadata)]
    );
    return result.rows[0] || null;
  } catch (err) {
    // Unique violation race condition fallback - treat as already saved.
    if (err.code === '23505') return null;
    throw err;
  }
}

export async function getRecentMessages(conversationId, limit = 30) {
  const result = await query(
    `SELECT role, content, timestamp FROM messages
     WHERE conversation_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse(); // chronological order
}

export async function countMessages(conversationId) {
  const result = await query('SELECT COUNT(*) FROM messages WHERE conversation_id = $1', [
    conversationId,
  ]);
  return parseInt(result.rows[0].count, 10);
}
