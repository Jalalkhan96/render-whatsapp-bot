const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const {
  animatedMediaToWebp,
  addStickerExifBuffer,
} = require('../lib/sticker');

module.exports = {
  command: 'sticker2',
  aliases: ['s2', 'stik2'],
  category: 'stickers',
  description: 'Convert image/video to sticker',
  usage: '.sticker2 (reply to image/video or send with caption)',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let targetMessage = message;
    const quotedInfo = message.message?.extendedTextMessage?.contextInfo;
    if (quotedInfo?.quotedMessage) {
      targetMessage = {
        key: { remoteJid: chatId, id: quotedInfo.stanzaId, participant: quotedInfo.participant },
        message: quotedInfo.quotedMessage,
      };
    }

    const mediaMessage = targetMessage.message?.imageMessage ||
      targetMessage.message?.videoMessage ||
      targetMessage.message?.documentMessage;

    if (!mediaMessage) {
      return sock.sendMessage(chatId, {
        text: '❌ Reply to an image, GIF or video with .sticker2.',
      }, { quoted: message });
    }

    try {
      const mediaBuffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
        logger: undefined,
        reuploadRequest: sock.updateMediaMessage,
      });
      if (!Buffer.isBuffer(mediaBuffer) || !mediaBuffer.length) throw new Error('Media download failed.');

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const animated = mediaMessage.mimetype?.includes('gif') ||
        mediaMessage.mimetype?.includes('video') ||
        Number(mediaMessage.seconds) > 0;

      let finalBuffer;
      if (animated) {
        const webpBuffer = await animatedMediaToWebp(mediaBuffer, {
          maxDuration: Math.min(6, Math.max(0.5, Number(mediaMessage.seconds) || 6)),
          maxBytes: 950 * 1024,
        });
        finalBuffer = await addStickerExifBuffer(webpBuffer, 'ABIX-AE Animated', 'Bot', ['🤖']);
      } else {
        const { writeExifImg } = require('../lib/exif');
        finalBuffer = await writeExifImg(mediaBuffer, { packname: 'ABIX-AE', author: 'Bot' });
      }

      await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
      console.error('[sticker2]', error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, {
        text: `❌ Sticker conversion failed.\n\n${error.message || 'Media conversion failed.'}`,
      }, { quoted: message });
    }
  },
};
