'use strict';
const assert = require('node:assert/strict');

// Pure UI checks only: tests never start polling or contact Telegram.
process.env.TELEGRAM_ADMIN_IDS = '123456789, 555000111';
// Keep this test independent of a developer/CI machine's secret environment.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS;
delete process.env.TELEGRAM_AUTO_APPROVE_CHAT_IDS;
const { internals, getTelegramStatus } = require('../lib/telegramBot');
const {
  FEATURES, THEMES, homeKeyboard, homeText, pageContent, pageKeyboard,
  renderSearchResults, parseAdminIds, splitText, isAdmin, getSession,
  autoApproveJoinRequestsEnabled, parseAutoApproveChatIds, shouldAutoApproveJoinRequest, getAllowedUpdates,
  formatChatIds, isGroupChat, isChannelChat, hasLink, getReplyKeyboard, getMiniAppUrl,
  getChatSettings, buildCommandMenu, getPreference,
} = internals;

assert.equal(Object.keys(THEMES).length, 3, 'three text theme presets are available');
assert.ok(homeText(123456789).includes('SYSTEM CONTROL'));
assert.ok(homeText(123456789).includes('WhatsApp + Telegram'));
assert.ok(homeText(123456789).length < 240, 'main menu text stays compact');
assert.ok(isAdmin(123456789));
assert.ok(isAdmin('555000111'));
assert.ok(!isAdmin('923001234567'), 'WhatsApp phone numbers do not grant Telegram admin access');
assert.deepEqual([...parseAdminIds()].sort(), ['123456789', '555000111']);

function checkKeyboard(keyboard, context) {
  assert.ok(Array.isArray(keyboard.inline_keyboard), `${context}: inline keyboard exists`);
  for (const row of keyboard.inline_keyboard) {
    assert.ok(Array.isArray(row) && row.length > 0, `${context}: rows are non-empty`);
    for (const item of row) {
      assert.equal(typeof item.text, 'string');
      assert.equal(typeof item.callback_data, 'string');
      assert.ok(Buffer.byteLength(item.callback_data, 'utf8') <= 64,
        `${context}: callback data must fit Telegram's 64-byte limit: ${item.callback_data}`);
    }
  }
}

checkKeyboard(homeKeyboard(123456789), 'home/admin');
checkKeyboard(homeKeyboard(987654321), 'home/user');

// Button layout preference: grid and full-width list both remain valid native keyboards.
const layoutPreference = getPreference(876543210);
layoutPreference.layout = 'grid';
assert.ok(homeKeyboard(876543210).inline_keyboard.every(row => row.length <= 2));
layoutPreference.layout = 'list';
assert.ok(homeKeyboard(876543210).inline_keyboard.every(row => row.length === 1));
layoutPreference.layout = 'grid';

const groupMessage = {
  chat: { id: -1001234567890, type: 'supergroup', title: 'ABIX Test Group' },
  from: { id: 987654321, username: 'test_user' },
  text: 'hello',
};
assert.equal(isGroupChat(groupMessage.chat), true);
assert.equal(isChannelChat({ id: -1009876543210, type: 'channel' }), true);
assert.ok(formatChatIds(groupMessage, 'all').includes('User ID: 987654321'));
assert.ok(formatChatIds(groupMessage, 'all').includes('Group ID: -1001234567890'));
assert.ok(formatChatIds(groupMessage, 'group').includes('ABIX Test Group'));
assert.ok(formatChatIds({ ...groupMessage, reply_to_message: { from: { id: 7654321, username: 'reply_target' } } }, 'user').includes('User ID: 7654321'));
assert.equal(hasLink({ text: 'visit https://example.com' }), true);
assert.equal(hasLink({ text: 'hello everyone' }), false);
assert.equal(hasLink({ entities: [{ type: 'text_link', url: 'https://example.com' }] }), true);
const replyKeyboard = getReplyKeyboard();
assert.equal(replyKeyboard.resize_keyboard, true);
assert.ok(replyKeyboard.keyboard.flat().some(item => item.text === '🆔 My ID'));

const commands = buildCommandMenu();
assert.ok(commands.length <= 100, 'Telegram command menu respects the Bot API limit');
assert.equal(new Set(commands.map(item => item.command)).size, commands.length, 'commands are unique');
for (const required of ['start', 'menu', 'id', 'myid', 'userid', 'chatid', 'groupid', 'channelid', 'album', 'inline', 'links', 'app', 'more', 'textpro', 'ephoto', 'birthdaycake']) {
  assert.ok(commands.some(item => item.command === required), `/${required} is registered in the BotFather menu`);
}
assert.ok(getAllowedUpdates().includes('channel_post'));
assert.ok(getAllowedUpdates().includes('inline_query'));
assert.equal(getChatSettings(-1001234567890).antiLink, false, 'anti-link starts disabled for each group');
const previousWebAppUrl = process.env.TELEGRAM_WEBAPP_URL;
process.env.TELEGRAM_WEBAPP_URL = 'http://insecure.example/app';
assert.equal(getMiniAppUrl(), '', 'Mini App URL must be HTTPS');
process.env.TELEGRAM_WEBAPP_URL = 'https://example.com/app';
assert.equal(getMiniAppUrl(), 'https://example.com/app');
if (previousWebAppUrl === undefined) delete process.env.TELEGRAM_WEBAPP_URL;
else process.env.TELEGRAM_WEBAPP_URL = previousWebAppUrl;
for (const key of ['ai', 'media', 'settings', 'tools', 'help', 'search']) {
  checkKeyboard(pageKeyboard(123456789, key, 'test-chat'), `page:${key}`);
  assert.ok(pageContent(123456789, key).length > 0, `page:${key} has content`);
}

const session = getSession('unit-test-chat', 987654321);
session.query = '';
session.filter = 'all';
session.sort = 'relevance';
session.page = 0;
const output = renderSearchResults(987654321, session);
assert.ok(output.text.includes('SEARCH RESULTS'));
checkKeyboard(output.markup, 'search results');
assert.ok(!output.text.includes('Admin Dashboard'), 'admin feature is hidden for non-admin users');

session.query = 'media';
session.filter = 'media';
session.page = 0;
const filtered = renderSearchResults(987654321, session);
assert.ok(filtered.text.toLowerCase().includes('media'));
checkKeyboard(filtered.markup, 'filtered search results');

const largeText = '0123456789'.repeat(1000);
const chunks = splitText(largeText, 3800);
assert.ok(chunks.length > 1);
assert.ok(chunks.every(chunk => chunk.length <= 3800));
assert.equal(chunks.join('').length, largeText.length);
assert.equal(FEATURES.some(feature => feature.id === 'ai'), true);
assert.equal(getTelegramStatus().configured, false, 'Telegram is optional when no token is configured');
assert.equal(autoApproveJoinRequestsEnabled(), false, 'join-request auto-approval is off by default');
assert.ok(!getAllowedUpdates().includes('chat_join_request'), 'join-request updates are not requested when feature is disabled');
process.env.TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS = 'true';
assert.equal(autoApproveJoinRequestsEnabled(), true, 'true enables join-request auto-approval');
assert.ok(getAllowedUpdates().includes('chat_join_request'), 'poller subscribes to join requests when enabled');
delete process.env.TELEGRAM_AUTO_APPROVE_CHAT_IDS;
assert.equal(shouldAutoApproveJoinRequest(-1001234567890), true, 'empty allowlist allows all eligible chats when explicitly enabled');
process.env.TELEGRAM_AUTO_APPROVE_CHAT_IDS = '-1001234567890, -1009876543210';
assert.deepEqual([...parseAutoApproveChatIds()].sort(), ['-1001234567890', '-1009876543210']);
assert.equal(shouldAutoApproveJoinRequest('-1001234567890'), true, 'allowlisted chat ID is accepted');
assert.equal(shouldAutoApproveJoinRequest('-1001111111111'), false, 'non-allowlisted chat is not auto-approved');
delete process.env.TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS;
delete process.env.TELEGRAM_AUTO_APPROVE_CHAT_IDS;
(async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const calls = [];
  process.env.TELEGRAM_BOT_TOKEN = '123456:TEST_ONLY_NOT_A_REAL_TOKEN';
  global.fetch = async (url, options = {}) => {
    const method = String(url).split('/').pop();
    let payload = {};
    try { payload = JSON.parse(options.body || '{}'); } catch {}
    calls.push({ method, payload });
    const result = method === 'answerInlineQuery'
      ? true
      : { message_id: 999, chat: { id: payload.chat_id, type: 'private' }, date: 1 };
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
  try {
    await internals.handleUpdate({ message: {
      message_id: 1, chat: { id: 987654321, type: 'private' },
      from: { id: 987654321, username: 'test_user' }, text: '/ping',
    } });
    assert.ok(calls.some(call => call.method === 'sendMessage' && String(call.payload.text).includes('PONG')),
      '/ping is routed to a Telegram response');

    calls.length = 0;
    await internals.handleUpdate({ message: {
      message_id: 2, chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
      from: { id: 987654321, username: 'test_user' }, text: '/groupid',
    } });
    assert.ok(calls.some(call => call.method === 'sendMessage' && String(call.payload.text).includes('Group ID: -1001234567890')),
      '/groupid is routed and returns the group ID');

    calls.length = 0;
    await internals.handleUpdate({ channel_post: {
      message_id: 3, chat: { id: -100555666777, type: 'channel', title: 'Test Channel', username: 'test_channel' },
      text: '/channelid',
    } });
    assert.ok(calls.some(call => call.method === 'sendMessage' && String(call.payload.text).includes('Channel ID: -100555666777')),
      '/channelid handles channel_post updates without a from user');

    calls.length = 0;
    await internals.handleUpdate({ inline_query: {
      id: 'inline-test-id', from: { id: 987654321 }, query: 'media',
    } });
    const inlineCall = calls.find(call => call.method === 'answerInlineQuery');
    assert.ok(inlineCall, 'inline queries are answered');
    assert.ok(Array.isArray(inlineCall.payload.results), 'inline query returns results');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
  console.log('[TEST] Telegram UI and command-routing regression checks passed');
})().catch(error => {
  console.error('[TEST] Telegram bot regression failure:', error);
  process.exitCode = 1;
});
