'use strict';

const assert = require('assert');
const plugin = require('../plugins2/acceptall.js');

assert.strictEqual(plugin.command, 'acceptall');
assert.strictEqual(plugin.permission, 'GROUP_ADMIN');
assert.strictEqual(plugin.groupOnly, true);
assert.strictEqual(plugin.adminOnly, true);
assert.strictEqual(plugin.botAdmin, true);
for (const alias of ['approveall', 'acceptrequests', 'approvejoin', 'acceptpending', 'approvepending']) {
  assert.ok(plugin.aliases.includes(alias), `Missing alias: ${alias}`);
}

(async () => {
  const calls = [];
  const sock = {
    async groupRequestParticipantsList() {
      return [{ jid: '111@s.whatsapp.net' }, { jid: '222@s.whatsapp.net' }];
    },
    async groupRequestParticipantsUpdate(jid, jids, action) {
      calls.push({ jid, jids, action });
      return jids.map((user) => ({ status: '200', jid: user }));
    },
    async sendMessage(jid, content) {
      calls.push({ send: true, jid, content });
    },
  };

  await plugin.handler(sock, {
    key: { remoteJid: '120363000000000000@g.us' },
  }, [], { chatId: '120363000000000000@g.us' });

  const update = calls.find((x) => x.action === 'approve');
  assert.ok(update, 'Approval call was not made');
  assert.deepStrictEqual(update.jids, ['111@s.whatsapp.net', '222@s.whatsapp.net']);
  console.log('✅ acceptall checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
