/**
 * ABIX-AE SERIF TEST
 *
 * Command:
 *   -serif -metaai
 *   -serif metaai
 *
 * TEST ONLY:
 * - Uses Baileys forwardedNewsletterMessageInfo when available.
 * - Requests the display name "ABIX-AE ✓".
 * - Does not use Meta AI.
 * - Does not claim or bypass genuine WhatsApp verification.
 * - Is intentionally isolated to this command.
 */

const { getChannelInfo } = require('../lib/channelInfo');

const TEST_CHANNEL_JID =
  String(
    process.env.ABIX_TEST_NEWSLETTER_JID ||
    process.env.NEWSLETTER_JID ||
    '120363413637544342@newsletter'
  ).trim();

const TEST_CHANNEL_NAME = 'ABIX-AE ✓';

const TEST_SERVER_MESSAGE_ID = Math.max(
  1,
  Number(process.env.ABIX_TEST_NEWSLETTER_MESSAGE_ID) || 1
);

function isMetaAiTest(value) {
  return new Set([
    '-metaai',
    'metaai',
    '-metai',
    'metai'
  ]).has(String(value || '').trim().toLowerCase());
}

function buildTestContext() {
  const base = getChannelInfo({
    newsletterJid: TEST_CHANNEL_JID,
    newsletterName: TEST_CHANNEL_NAME,
    forwardingScore: 1,
    isForwarded: true
  });

  return {
    ...(base?.contextInfo || {}),
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: TEST_CHANNEL_JID,
      newsletterName: TEST_CHANNEL_NAME,
      serverMessageId: TEST_SERVER_MESSAGE_ID
    }
  };
}

async function sendSerifTest(sock, chatId, content, options) {
  /*
   * channelInfo.js is the existing centralized forwarding wrapper.
   * It checks NEWSLETTER_NAME at send time. Temporarily setting it here
   * keeps the override scoped to this test command instead of changing
   * production channel-forward behavior.
   */
  const hadName = Object.prototype.hasOwnProperty.call(
    process.env,
    'NEWSLETTER_NAME'
  );
  const previousName = process.env.NEWSLETTER_NAME;

  process.env.NEWSLETTER_NAME = TEST_CHANNEL_NAME;

  try {
    return await sock.sendMessage(chatId, content, options);
  } finally {
    if (hadName) {
      process.env.NEWSLETTER_NAME = previousName;
    } else {
      delete process.env.NEWSLETTER_NAME;
    }
  }
}

module.exports = {
  command: 'serif',
  aliases: ['seriftest'],
  category: 'utility',
  description: 'Test channel-forward display metadata',
  usage: '-serif -metaai',

  async handler(sock, message, args = [], context = {}) {
    const chatId =
      context.chatId ||
      message?.key?.remoteJid;

    if (!chatId) return;

    const mode = String(args[0] || '').trim().toLowerCase();

    if (!isMetaAiTest(mode)) {
      await sock.sendMessage(
        chatId,
        {
          text:
            '🧪 *SERIF TEST*\n\n' +
            'Usage: `-serif -metaai`\n\n' +
            'Test-only channel-forward display metadata.'
        },
        { quoted: message }
      );
      return;
    }

    const contextInfo = buildTestContext();

    try {
      await sendSerifTest(
        sock,
        chatId,
        {
          text:
            '🧪 *SERIF TEST*\n\n' +
            'ABIX-AE ✓\n\n' +
            'Test-only forwarded-channel display metadata.',
          contextInfo
        },
        { quoted: message }
      );
    } catch (error) {
      console.error('[SERIF TEST]', error);

      try {
        await sock.sendMessage(
          chatId,
          {
            text: '❌ SERIF test failed.'
          },
          { quoted: message }
        );
      } catch {}
    }
  }
};
