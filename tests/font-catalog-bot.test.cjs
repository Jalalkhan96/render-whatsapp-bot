'use strict';
const assert = require('assert');
const db = require('../lib/fontCatalogDb');
const font = require('../plugins/font-downloader');
const fd = require('../plugins/fd');
const catalog = require('../plugins2/font-catalog');

assert.strictEqual(font.command, 'font', 'legacy -font command must remain available');
assert.strictEqual(typeof font.handler, 'function');
assert.strictEqual(typeof font.downloadSelectedFonts, 'function', '-fd depends on this export');
assert.strictEqual(fd.command, 'fd', 'legacy -fd command must remain available');
assert.strictEqual(typeof fd.handler, 'function');
assert.ok(font.aliases.includes('fontmenu'));
assert.ok(font._test.menu('-').includes('-font urdu random'));
assert.ok(font._test.menu('-').includes('-fd 1,3,5'));
assert.strictEqual(db.sourceByName('google-fonts')?.key, 'google-fonts');
assert.strictEqual(db.sourceByName('fontspace')?.key, 'fontspace');
assert.strictEqual(db.sourceByName('1001-free-fonts')?.key, '1001-free-fonts');
assert.ok(db._test.makeWhere({ language: 'urdu' }).sql.includes('WHERE'));
assert.ok(db._test.makeWhere({ license: 'free' }).args.some(value => String(value).includes('free')));
assert.ok(db._test.makeWhere({ source: 'fontspace' }).args.some(value => String(value).includes('fontspace')));
assert.ok(Array.isArray(catalog) && catalog.some(plugin => plugin.command === 'fontdb'));
for (const command of ['fontsites', 'fontstats', 'fontget', 'dafontdb', 'googlefontsdb', 'fontsharedb', 'fontsquirreldb', 'freefontsdb', 'abstractfontsdb', 'fontspacedb', 'urbanfontsdb', 'wfontsdb']) {
  assert.ok(catalog.some(plugin => plugin.command === command), `missing ${command}`);
}
async function testMissingConfig() {
  const oldUrl = process.env.TURSO_DATABASE_URL;
  const oldToken = process.env.TURSO_AUTH_TOKEN;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  const sent = [];
  const sock = { sendMessage: async (_jid, content) => { sent.push(content); return content; } };
  const message = { key: { remoteJid: 'test@s.whatsapp.net' } };
  try {
    await font._test.handleCommand(sock, message, ['search', 'anime'], { prefix: '-', chatId: message.key.remoteJid });
    assert.ok(sent.at(-1).text.includes('TURSO_DATABASE_URL'), 'missing DB credentials should return a clear setup error');
  } finally {
    if (oldUrl !== undefined) process.env.TURSO_DATABASE_URL = oldUrl;
    if (oldToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldToken;
  }
}
testMissingConfig().then(() => console.log('✅ font catalog command integration checks passed')).catch(error => { console.error(error); process.exitCode = 1; });
