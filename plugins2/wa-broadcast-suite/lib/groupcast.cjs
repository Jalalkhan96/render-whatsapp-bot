// Group broadcast + group listing. Only sends to groups the line is a member of.
const { sleep, rand, bareJid } = require('./util.cjs');

async function listGroups(sock) {
  const all = await sock.groupFetchAllParticipating();
  return Object.values(all || {}).map((g) => ({
    jid: bareJid(g.id),
    name: g.subject || '(no name)',
    members: (g.participants || []).length,
  }));
}

async function broadcastGroups({ sock, jids, message, media, delayMin = 30, delayMax = 90, skip = [], onEvent = () => {} }) {
  const emit = (e) => { try { onEvent(e); } catch (_) {} };
  const results = [];
  const skipSet = new Set(skip.map(bareJid));
  for (const jid of jids.map(bareJid)) {
    if (skipSet.has(jid)) continue;
    try {
      const content = media ? { image: { url: media }, caption: message } : { text: message };
      const r = await sock.sendMessage(jid, content);
      results.push({ group: jid, status: 'sent', messageId: r.key.id });
      emit({ type: 'sent', group: jid, done: results.length, total: jids.length });
    } catch (e) {
      results.push({ group: jid, status: 'failed', error: String(e?.message || e) });
      emit({ type: 'failed', group: jid, error: String(e?.message || e) });
    }
    await sleep(rand(delayMin, delayMax) * 1000);
  }
  emit({ type: 'done', results });
  return results;
}

module.exports = { listGroups, broadcastGroups };
