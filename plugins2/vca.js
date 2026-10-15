'use strict';

/**
 * VCA — one group message that WhatsApp clients can resolve to the
 * viewing participant's own profile card.
 *
 * Command: -vca
 * Groups only.
 *
 * This is implemented as a normal plugins2 command so the existing command
 * loader handles prefix parsing, hot-reload and command permissions.
 */
const {
  jidNormalizedUser,
  generateWAMessageFromContent,
  proto,
} = require('@whiskeysockets/baileys');

const TRIGGER = /^-vca$/i;

function getBody(message) {
  return String(
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    ''
  ).trim();
}

async function vcaHandler(sock, message, args = [], context = {}) {
  const chatId = message?.key?.remoteJid;
  if (!chatId || !chatId.endsWith('@g.us')) return;

  // The command router already matched "vca". Keep the explicit trigger
  // check too, so direct/manual handler calls cannot accidentally fire it.
  if (!TRIGGER.test(getBody(message))) return;

  const groupJid = jidNormalizedUser(chatId);
  const sender = jidNormalizedUser(
    message?.key?.participant || message?.key?.remoteJid || ''
  );

  if (!groupJid || !sender) return;

  // Core behaviour: mention the GROUP JID itself. WhatsApp clients may
  // resolve this mention against the participant viewing the message,
  // producing a self-profile-card rendering for each viewer.
  const content = {
    extendedTextMessage: {
      text: '🪪 ···',
      mentions: [groupJid],
      contextInfo: {
        mentionedJid: [groupJid],
        // Keep the payload minimal. These are compatibility hints used by
        // clients that support the self-card resolver.
        conversionSource: 'https://wa.me/',
        conversionData: Buffer.from([0x00]).toString('base64'),
        remoteJid: groupJid,
        participant: groupJid,
      },
    },
  };

  const userJid = String(sock?.user?.id || sender);
  const waMsg = generateWAMessageFromContent(
    chatId,
    proto.Message.fromObject(content),
    {
      userJid,
      messageId: undefined,
      timestamp: undefined,
    }
  );

  try {
    return await sock.relayMessage(chatId, waMsg.message, {
      messageId: waMsg.key.id,
      additionalAttributes: { edit: '1' },
    });
  } catch (error) {
    console.error('[VCA] Native relay failed:', error?.message || error);

    // Safe fallback: a small vCard message rather than failing silently.
    // It does not attempt to impersonate a participant.
    const number = groupJid.split('@')[0];
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:···',
      `TEL;waid=${number}:${number}`,
      'END:VCARD',
    ].join('\n');

    return await sock.sendMessage(
      chatId,
      {
        contacts: {
          displayName: '···',
          contacts: [{ vcard }],
        },
        mentions: [groupJid],
      },
      { quoted: message }
    );
  }
}

module.exports = {
  command: 'vca',
  aliases: [],
  category: 'fun',
  groupOnly: true,
  description: 'Send a group self-profile-card resolver message',
  usage: '-vca',
  handler: vcaHandler,
  TRIGGER,
};
