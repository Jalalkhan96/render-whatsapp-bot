'use strict';

const {
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const settings = require('../settings');
const {
  setWelcomeMedia,
  removeWelcomeMedia,
  MAX_INPUT_BYTES,
} = require('../lib/welcomeMedia');

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 8 && current; i++) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else break;
  }
  return current;
}

function getQuotedImage(message) {
  const contextInfo = message?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.imageMessage?.contextInfo ||
    message?.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessageV2?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessageV2Extension?.message?.extendedTextMessage?.contextInfo;
  const quoted = unwrap(contextInfo?.quotedMessage);
  if (!quoted?.imageMessage) return null;
  return quoted.imageMessage;
}

async function downloadImage(message) {
  const stream = await downloadContentFromMessage(message, 'image');
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const part = Buffer.from(chunk);
    total += part.length;
    if (total > MAX_INPUT_BYTES) throw new Error('Image is too large. Maximum is 8 MB.');
    chunks.push(part);
  }
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('Downloaded image is empty.');
  return buffer;
}

module.exports = {
  command: 'setwelcomeimg',
  aliases: ['setwelcomeimage', 'welcomeimg', 'welcomepic'],
  category: 'admin',
  description: 'Set the custom welcome-card background image for this group',
  usage: `${settings.prefixes[0] || '-'}setwelcomeimg (reply to an image)`,
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message?.key?.remoteJid;
    const prefix = settings.prefixes[0] || '-';
    const mode = String(args[0] || '').trim().toLowerCase();

    if (mode === 'reset' || mode === 'default' || mode === 'off') {
      removeWelcomeMedia(chatId);
      return sock.sendMessage(chatId, {
        text: `✅ Welcome image reset for this group.\n\nThe ABIX default welcome design will be used now.`,
      }, { quoted: message });
    }

    const imageMessage = getQuotedImage(message);
    if (!imageMessage) {
      return sock.sendMessage(chatId, {
        text: `⚠️ Reply to an *image* with *${prefix}setwelcomeimg*.\n\n✅ Supported: JPG, PNG, WEBP\n✅ GIF: first frame is used\n\nReset with *${prefix}setwelcomeimg reset*.`,
      }, { quoted: message });
    }

    try {
      const input = await downloadImage(imageMessage);
      const normalized = await sharp(input, { animated: false })
        .rotate()
        .resize({ width: 1600, height: 900, fit: 'cover', position: 'attention' })
        .png({ compressionLevel: 9 })
        .toBuffer();

      const entry = await setWelcomeMedia(
        chatId,
        normalized,
        imageMessage.mimetype || 'image/jpeg',
      );

      return sock.sendMessage(chatId, {
        text: `✅ *Welcome image updated*\n\n📁 Saved: \`${entry?.file || 'assets/welcome/…'}\`\n🎨 The new design will be applied to future join messages.\n\nUse *${prefix}welcome on* to enable welcomes.`,
      }, { quoted: message });
    } catch (error) {
      console.error('[SETWELCOMEIMG]', error);
      return sock.sendMessage(chatId, {
        text: `❌ Failed to update the welcome image.\n\n${error.message}`,
      }, { quoted: message });
    }
  },
};
