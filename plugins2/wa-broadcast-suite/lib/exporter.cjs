// Export what the session knows: full group list + collected contacts.
// Note: Baileys only sees contacts synced to the linked device/session, so
// the contact sheet is "every contact seen this session", not the phone's
// full address book.
const path = require('path');
const { saveExcel, stamp, bareJid, jidToPhone } = require('./util.cjs');
const { listGroups } = require('./groupcast.cjs');

async function exportChatsXlsx(sock, contactsMap, outDir) {
  const groups = await listGroups(sock).catch(() => []);
  const groupRows = groups.map((g) => ({ type: 'group', name: g.name, jid: g.jid, members: g.members }));
  const contactRows = [...contactsMap.entries()].map(([jid, name]) => ({ name: name || '', phone: jidToPhone(jid), jid: bareJid(jid) }));
  const file = path.join(outDir, `chats-contacts-${stamp()}.xlsx`);
  saveExcel(file, { Groups: groupRows.length ? groupRows : [{}], Contacts: contactRows.length ? contactRows : [{}] });
  return { file, groups: groupRows.length, contacts: contactRows.length };
}

module.exports = { exportChatsXlsx };
