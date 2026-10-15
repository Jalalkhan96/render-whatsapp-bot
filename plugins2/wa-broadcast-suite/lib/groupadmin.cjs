// Group admin tools: bulk-create your own groups, and bulk-add members to
// groups where the line is an admin. Only add people who agreed to join.
const { sleep, rand, bareJid, normPhone, toJid } = require('./util.cjs');

async function createGroups({ sock, names, participantJids = [], delaySec = 20, onEvent = () => {} }) {
  const emit = (e) => { try { onEvent(e); } catch (_) {} };
  const results = [];
  for (const name of names) {
    try {
      const g = await sock.groupCreate(name, participantJids.map(bareJid));
      results.push({ name, status: 'created', jid: bareJid(g.id) });
      emit({ type: 'created', name, jid: bareJid(g.id) });
    } catch (e) {
      results.push({ name, status: 'failed', error: String(e?.message || e) });
      emit({ type: 'failed', name, error: String(e?.message || e) });
    }
    await sleep(rand(delaySec * 0.7, delaySec * 1.3) * 1000);
  }
  return results;
}

async function isAdmin(sock, groupJid, meJid) {
  const meta = await sock.groupMetadata(bareJid(groupJid));
  const me = bareJid(meJid).split('@')[0];
  return (meta.participants || []).some((p) => {
    const pid = bareJid(p.id).split('@')[0];
    return pid === me && (p.admin === 'admin' || p.admin === 'superadmin');
  });
}

async function bulkAddMembers({ sock, groupJid, phones, chunkSize = 10, delaySec = 30, onEvent = () => {} }) {
  const emit = (e) => { try { onEvent(e); } catch (_) {} };
  const jid = bareJid(groupJid);
  const me = bareJid(sock.user?.id || '');
  if (!(await isAdmin(sock, jid, me))) throw new Error('This line is not an admin of that group — only admins can add members.');
  const targets = [...new Set((phones || []).map(normPhone).filter(Boolean))].map(toJid);
  const results = [];
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    try {
      const res = await sock.groupParticipantsUpdate(jid, chunk, 'add');
      for (const c of chunk) {
        const st = res?.find?.((r) => bareJid(r.jid || r.participant) === bareJid(c));
        results.push({ phone: c.split('@')[0], status: st?.status === '200' || st == null ? 'added' : `code ${st?.status}`, detail: st?.status ? String(st.status) : '' });
      }
      emit({ type: 'chunk', done: Math.min(i + chunkSize, targets.length), total: targets.length });
    } catch (e) {
      for (const c of chunk) results.push({ phone: c.split('@')[0], status: 'failed', detail: String(e?.message || e) });
      emit({ type: 'failed-chunk', error: String(e?.message || e) });
    }
    if (i + chunkSize < targets.length) await sleep(rand(delaySec * 0.7, delaySec * 1.3) * 1000);
  }
  return results;
}

module.exports = { createGroups, bulkAddMembers, isAdmin };
