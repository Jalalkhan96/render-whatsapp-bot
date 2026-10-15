const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { animatedWebpFromBuffer } = require('../lib/sticker');

function getReplyMessage(message) {
  const current = message?.message || {};
  return current.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function findMedia(message) {
  const current = message?.message || {};
  const quoted = getReplyMessage(message) || {};

  const candidates = [
    // Directly attached GIF/video.
    current.videoMessage && ['video', current.videoMessage],
    current.documentMessage && ['document', current.documentMessage],

    // Replied GIF/video.
    quoted.videoMessage && ['video', quoted.videoMessage],
    quoted.documentMessage && ['document', quoted.documentMessage],
  ].filter(Boolean);

  return candidates[0] || [null, null];
}

function isGifLike(mediaMessage, type) {
  if (!mediaMessage) return false;

  if (type === 'video') {
    // WhatsApp GIFs are normally transported as videoMessage + gifPlayback.
    return mediaMessage.gifPlayback === true;
  }

  if (type === 'document') {
    const mime = String(mediaMessage.mimetype || '').toLowerCase();
    return mime === 'image/gif' || mime === 'video/mp4' || mime.startsWith('video/');
  }

  return false;
}

async function getMediaBuffer(message) {
  const [type, mediaMessage] = findMedia(message);
  if (!mediaMessage) return { buffer: null, seconds: 0, type: null, isGif: false };

  const stream = await downloadContentFromMessage(
    mediaMessage,
    type === 'document' ? 'document' : 'video'
  );

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);

  return {
    buffer: Buffer.concat(chunks),
    seconds: Math.min(6, Math.max(1, Number(mediaMessage.seconds) || 6)),
    type,
    isGif: isGifLike(mediaMessage, type),
  };
}

module.exports = {
  // Kept as an explicit legacy command; -s is reserved for the general sticker converter.
  command: 'gif2sticker',
  aliases: ['g2s', 'g2st', 'g2stick', 'videosticker', 'tosticker'],
  category: 'media',
  description: 'Reply to a GIF and convert it into a real animated WebP sticker',
  usage: '-gif2sticker (reply to a GIF)',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      const { buffer, seconds, isGif } = await getMediaBuffer(message);

      if (!buffer?.length) {
        return sock.sendMessage(chatId, {
          text: '❌ Reply to a GIF with -s.\n\nExample: reply to any WhatsApp GIF and send -s',
        }, { quoted: message });
      }

      if (!isGif) {
        return sock.sendMessage(chatId, {
          text: '❌ This command is only for GIFs.\nReply to a GIF and send -gif2sticker.',
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, {
        react: { text: '⏳', key: message.key },
      });

      const sticker = await animatedWebpFromBuffer(buffer, {
        maxDuration: Math.min(6, Math.max(1, seconds || 6)),
      });

      if (!Buffer.isBuffer(sticker) || sticker.length < 100) {
        throw new Error('Animated WebP output is invalid');
      }

      await sock.sendMessage(chatId, {
        sticker,
        isAnimated: true,
      }, { quoted: message });

      await sock.sendMessage(chatId, {
        react: { text: '✅', key: message.key },
      });
    } catch (e) {
      console.error('[GIF2STICKER] error:', e);

      try {
        await sock.sendMessage(chatId, {
          react: { text: '❌', key: message.key },
        });
      } catch {}

      await sock.sendMessage(chatId, {
        text: `❌ GIF to sticker conversion failed. ${e?.message || 'The GIF could not be converted.'}`,
      }, { quoted: message });
    }
  },
};
