// Member finder/extractor for groups the line is already a member of.
// Supports multiple groups at once -> one Excel with a sheet per group.
const { bareJid, jidToPhone } = require('./util.cjs');

async function getGroupMembers(sock, groupJid) {
  const meta = await sock.groupMetadata(bareJid(groupJid));
  return {
    name: meta.subject || '(no name)',
    jid: bareJid(meta.id),
    members: (meta.participants || []).map((p) => ({
      phone: jidToPhone(p.id),
      jid: bareJid(p.id),
      is_admin: p.admin === 'admin' || p.admin === 'superadmin' ? 'yes' : 'no',
    })),
  };
}

async function exportMembersMulti(sock, groupJids) {
  const sheets = {};
  const all = [];
  for (const gj of groupJids) {
    try {
      const g = await getGroupMembers(sock, gj);
      const rows = g.members.map((m) => ({ group: g.name, phone: m.phone, is_admin: m.is_admin }));
      sheets[g.name.slice(0, 28)] = rows;
      all.push(...rows);
    } catch (e) {
      sheets[`ERR ${String(gj).slice(-12)}`] = [{ error: String(e?.message || e) }];
    }
  }
  sheets['ALL'] = all;
  return sheets;
}

module.exports = { getGroupMembers, exportMembersMulti };
