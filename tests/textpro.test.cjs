'use strict';

const assert = require('node:assert/strict');
const {
  POPULAR_TEMPLATES,
  NEW_TEMPLATES,
  EPHOTO_POPULAR_TEMPLATES,
  EPHOTO_NEW_TEMPLATES,
  BIRTHDAY_POPULAR_TEMPLATES,
  BIRTHDAY_NEW_TEMPLATES,
  SITE_CONFIGS,
  ALL_TEMPLATES,
  resolveTemplate,
  isAllowedEffectUrl,
  isAllowedTextProUrl,
  splitTextFields,
  templateUsage,
  getSiteTemplates,
} = require('../lib/textproCatalog.cjs');
const { status } = require('../lib/textproService.cjs');
const whatsappPlugins = require('../plugins2/textpro.js');
const legacyEphotoPlugin = require('../plugins/textmaker.js');
const { internals } = require('../lib/telegramBot');

assert.ok(POPULAR_TEMPLATES.length >= 10, 'TextPro popular presets exist');
assert.ok(NEW_TEMPLATES.length >= 10, 'TextPro new template fallback exists');
assert.ok(EPHOTO_POPULAR_TEMPLATES.length >= 6, 'Ephoto popular presets exist');
assert.ok(EPHOTO_NEW_TEMPLATES.length >= 4, 'Ephoto latest presets exist');
assert.ok(BIRTHDAY_POPULAR_TEMPLATES.length >= 5, 'BirthdayCake popular presets exist');
assert.ok(BIRTHDAY_NEW_TEMPLATES.length >= 4, 'BirthdayCake latest presets exist');
assert.deepEqual(Object.keys(SITE_CONFIGS).sort(), ['birthdaycake', 'ephoto', 'textpro']);
assert.equal(new Set(ALL_TEMPLATES.map(item => item.command)).size, ALL_TEMPLATES.length, 'all effect commands are unique');
assert.ok(ALL_TEMPLATES.every(item => isAllowedEffectUrl(item.url)), 'all fixed templates use allowlisted HTTPS URLs');

assert.equal(resolveTemplate('neon').command, 'tpneon');
assert.equal(resolveTemplate('/tpchrome').key, 'chrome');
assert.equal(resolveTemplate('epmagic').site, 'ephoto');
assert.equal(resolveTemplate('/epdeadpool').inputs, 2);
assert.equal(resolveTemplate('bdfireworks').site, 'birthdaycake');
assert.equal(resolveTemplate('https://textpro.me/neon-light-text-effect-online-882.html').key, 'neon');
assert.equal(resolveTemplate('https://en.ephoto360.com/magic-text-effect-278.html').command, 'epmagic');
assert.equal(resolveTemplate('https://birthdaycake24.com/create-a-happy-birthday-firework-effect-with-name-891.html').command, 'bdfireworks');
assert.equal(resolveTemplate('http://127.0.0.1/admin'), null, 'local URLs are rejected');
assert.equal(resolveTemplate('https://example.com/a-123.html'), null, 'other domains are rejected');
assert.equal(isAllowedTextProUrl('https://en.ephoto360.com/magic-text-effect-278.html'), true, 'backward-compatible validator allows the added sites');
assert.equal(isAllowedEffectUrl('https://ephoto360.com/magic-text-effect-278.html'), false, 'captcha-enforcing main Ephoto domain is not enabled');
assert.deepEqual(splitTextFields('ONE NAME', 1), ['ONE NAME']);
assert.deepEqual(splitTextFields('ALPHA | BETA', 2), ['ALPHA', 'BETA']);
assert.deepEqual(splitTextFields('ONE | TWO | THREE', 3), ['ONE', 'TWO', 'THREE']);
assert.throws(() => splitTextFields('ONE', 2), { code: 'TEXT_PRO_FIELD_COUNT' });
assert.throws(() => splitTextFields('ONE || THREE', 3), { code: 'TEXT_PRO_EMPTY_FIELD' });
assert.ok(templateUsage(ALL_TEMPLATES.find(item => item.key === 'neon'), '-').startsWith('-tpneon'));
assert.ok(templateUsage({ key: 'custom', site: 'ephoto', url: 'https://en.ephoto360.com/test-123.html', inputs: 1 }, '-').startsWith('-ephoto '));
assert.equal(getSiteTemplates('ephoto', 'popular').length, EPHOTO_POPULAR_TEMPLATES.length);
assert.equal(getSiteTemplates('birthdaycake', 'new').length, BIRTHDAY_NEW_TEMPLATES.length);
assert.equal(status().enabled, true, 'effect generation is enabled by default');

const { TEXTPRO_COMMANDS, textProMenuKeyboard, textProListText } = internals;
assert.equal(TEXTPRO_COMMANDS.size, ALL_TEMPLATES.length, 'Telegram has a direct command for every catalog effect');
function checkKeyboard(keyboard, label) {
  assert.ok(Array.isArray(keyboard.inline_keyboard), `${label} keyboard exists`);
  for (const row of keyboard.inline_keyboard) for (const item of row) {
    assert.ok(Buffer.byteLength(item.callback_data, 'utf8') <= 64, `${label} callback fits Telegram limit`);
  }
}
checkKeyboard(textProMenuKeyboard(123456789), 'TextPro menu');
checkKeyboard(textProListText(123456789, 'new', NEW_TEMPLATES, 1).markup, 'TextPro list');

const commands = whatsappPlugins.map(plugin => plugin.command);
assert.equal(new Set(commands).size, commands.length, 'WhatsApp command names are unique');
for (const command of ['textpro', 'birthdaycake', 'epopular', 'epnew', 'epsearch', 'epcategories', 'bcpopular', 'bcnew', 'bcsearch', 'bccategories']) {
  assert.ok(commands.includes(command), `WhatsApp site command ${command} exists`);
}
assert.equal(legacyEphotoPlugin.command, 'ephoto', 'existing WhatsApp ephoto command is the unified entrypoint');
assert.equal(typeof whatsappPlugins.ephotoSitePlugin?.handler, 'function', 'unified Ephoto entrypoint is available to the existing plugin');
const fs = require('node:fs');
const rootIndex = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.js'), 'utf8');
assert.ok(rootIndex.includes('startTelegramBot({ commandHandler })'), 'main ABIX process starts the optional Telegram transport');
assert.ok(rootIndex.includes('stopTelegramBot().catch'), 'main ABIX process stops Telegram polling on shutdown');
assert.ok(ALL_TEMPLATES.length + 25 <= 100, 'Telegram Bot API command list stays below its per-scope limit');
for (const item of ALL_TEMPLATES) assert.ok(commands.includes(item.command), `WhatsApp command ${item.command} exists`);

console.log(`[TEST] multi-site effect catalog and dual-platform UI checks passed (${ALL_TEMPLATES.length} individual template commands)`);
