'use strict';

/**
 * bgr.js — Background Removal using @imgly/background-removal-node
 * No API key required. Uses ONNX AI model locally.
 * Command: -bgr
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

let removeBackground = null;
let loadError = null;

// Lazy-load the library so startup doesn't fail if it's not installed yet
async function getRemover() {
  if (removeBackground) return removeBackground;
  if (loadError) throw loadError;
  try {
    const mod = await import('@imgly/background-removal-node');
    removeBackground = mod.default || mod.removeBackground || mod;
    return removeBackground;
  } catch (err) {
    loadError = new Error(
      '❌ @imgly/background-removal-node is not installed.\n' +
      'Run: npm install @imgly/background-removal-node'
    );
    throw loadError;
  }
}

async function getImageBuffer(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imageMessage = quoted?.imageMessage || message.message?.imageMessage;
  if (!imageMessage) return null;

  const stream = await downloadContentFromMessage(imageMessage, 'image');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = {
  command: 'bgr',
  aliases: ['bgrremove', 'airemovebg', 'bgremoveai'],
  category: 'tools',
  description: 'AI background removal — no API key needed',
  usage: '-bgr (reply to image or send image with caption -bgr)',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    // Usage hint
    const imageBuffer = await getImageBuffer(message);
    if (!imageBuffer) {
      return sock.sendMessage(chatId, {
        text:
          '🖼️ *AI Background Remover*\n\n' +
          'Reply to an image with *-bgr* or send an image with caption *-bgr*.\n\n' +
          '✅ No API key needed — runs AI locally!\n' +
          '⚙️ Model: ISNet FP16\n' +
          '📦 Powered by @imgly/background-removal-node',
      }, { quoted: message });
    }

    // Send processing notice
    await sock.sendMessage(chatId, {
      text: '⏳ *Processing...*\n\nRemoving background with AI. This may take 5–30 seconds on first run (model download).',
    }, { quoted: message });

    try {
      const remover = await getRemover();

      // Convert buffer → Blob for the library
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

      const resultBlob = await remover(blob, {
        debug: false,
        device: 'cpu',
        model: 'isnet_fp16',
        output: { format: 'image/png', quality: 1.0 },
      });

      // Convert result Blob → Buffer
      const arrayBuffer = await resultBlob.arrayBuffer();
      const resultBuffer = Buffer.from(arrayBuffer);

      await sock.sendMessage(chatId, {
        image: resultBuffer,
        mimetype: 'image/png',
        caption:
          '✅ *Background Removed!*\n\n' +
          '🤖 AI Model: ISNet FP16\n' +
          '🔧 No API key used — 100% local AI\n' +
          '𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬 𝗔𝗕𝗜𝗫-𝗔𝗘',
      }, { quoted: message });

    } catch (err) {
      console.error('[BGR] Error:', err.message);

      let msg = '❌ Background removal failed.\n\n';
      if (err.message.includes('not installed')) {
        msg += err.message;
      } else if (err.message.includes('model')) {
        msg += 'AI model download failed. Check your internet connection and try again.';
      } else {
        msg += `Details: ${err.message}`;
      }

      await sock.sendMessage(chatId, { text: msg }, { quoted: message });
    }
  },
};
