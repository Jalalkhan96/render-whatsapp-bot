const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { sendSpoiler } = require('../lib/mediaExtras');

async function readMedia(message) {
  const messageType = Object.keys(message || {}).find(type => /Message$/.test(type));
  if (!messageType) return null;
  const media = message[messageType];
  if (!media || !/^(image|video|sticker|document)Message$/.test(messageType)) return null;
  const stream = await downloadContentFromMessage(media, messageType.replace('Message', '').toLowerCase());
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { type: messageType.replace('Message','').toLowerCase(), media, buffer: Buffer.concat(chunks) };
}

function getQuoted(message) {
  return message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    message.message?.imageMessage?.contextInfo?.quotedMessage ||
    message.message?.videoMessage?.contextInfo?.quotedMessage ||
    message.message?.stickerMessage?.contextInfo?.quotedMessage || null;
}

function getText(message) {
  return message?.conversation || message?.extendedTextMessage?.text || '';
}

module.exports = {
  command: 'spoiler',
  aliases: ['spoil', 'sps'],
  category: 'media',
  description: 'Send replied text/image/video/sticker as spoiler',
  usage: '.spoiler (reply to text, image, video or sticker)',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const quoted = getQuoted(message);
    if (!quoted) {
      return sock.sendMessage(chatId, {
        text: '⚠️ Reply to a text, image, video, or sticker with `.spoiler`.',
      }, { quoted: message });
    }

    try {
      const text = getText(quoted);
      if (text) return sendSpoiler(sock, chatId, { text }, { quoted: message });

      const media = await readMedia(quoted);
      if (!media) throw new Error('Unsupported replied message type.');

      if (media.type === 'sticker') {
        return sendSpoiler(sock, chatId, { sticker: media.buffer }, { quoted: message });
      }
      if (media.type === 'image') {
        return sendSpoiler(sock, chatId, { image: media.buffer }, { quoted: message });
      }
      if (media.type === 'video') {
        return sendSpoiler(sock, chatId, { video: media.buffer, mimetype: media.media.mimetype || 'video/mp4' }, { quoted: message });
      }
      if (media.type === 'document') {
        return sendSpoiler(sock, chatId, { document: media.buffer, mimetype: media.media.mimetype || 'application/octet-stream', fileName: media.media.fileName || 'spoiler' }, { quoted: message });
      }
      throw new Error('Unsupported media type.');
    } catch (error) {
      console.error('[SPOILER] Error:', error);
      return sock.sendMessage(chatId, { text: `❌ Could not create spoiler: ${error.message}` }, { quoted: message });
    }
  },
};
