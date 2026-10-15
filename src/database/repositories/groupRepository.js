import { query } from '../database.js';
import { config } from '../../config.js';

export async function getGroup(jid) {
  const result = await query('SELECT * FROM groups WHERE jid = $1', [jid]);
  return result.rows[0] || null;
}

export async function isGroupApproved(jid) {
  const group = await getGroup(jid);
  return !!group?.enabled;
}

export async function addGroup(jid, name = null) {
  const result = await query(
    `INSERT INTO groups (jid, name, enabled, mode)
     VALUES ($1, $2, TRUE, $3)
     ON CONFLICT (jid) DO UPDATE SET enabled = TRUE, name = COALESCE($2, groups.name), updated_at = NOW()
     RETURNING *`,
    [jid, name, config.groups.mode]
  );
  return result.rows[0];
}

export async function removeGroup(jid) {
  const result = await query(
    `UPDATE groups SET enabled = FALSE, updated_at = NOW() WHERE jid = $1 RETURNING *`,
    [jid]
  );
  return result.rows[0] || null;
}

export async function listApprovedGroups() {
  const result = await query('SELECT * FROM groups WHERE enabled = TRUE ORDER BY name');
  return result.rows;
}
