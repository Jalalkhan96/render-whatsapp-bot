'use strict';

const fs = require('node:fs');
const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { animatedWebpFromBuffer } = require('../lib/sticker');

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_STATIC_STICKER_BYTES = 100 * 1024;
const MAX_ANIMATED_SECONDS = 6;

const WRAPPER_KEYS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
];

function unwrapContent(messageOrContent) {
  let content = messageOrContent?.message || messageOrContent || {};
  for (let i = 0; i < 6; i++) {
    let next = null;
    for (const key of WRAPPER_KEYS) {
      if (content?.[key]?.message) {
        next = content[key].message;
        break;
      }
    }
    if (!next) break;
    content = next;
  }
  return content || {};
}

function findContextInfo(message) {
  const content = unwrapContent(message);
  const preferred = [
    'extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage',
    'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage',
  ];
  for (const key of preferred) {
    const contextInfo = content?.[key]?.contextInfo;
    if (contextInfo?.quotedMessage) return contextInfo;
  }
  return null;
}

function getQuotedMessage(message) {
  const contextInfo = findContextInfo(message);
  if (!contextInfo?.quotedMessage || !contextInfo?.stanzaId) return null;

  const key = {
    remoteJid: message.key.remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId,
  };
  if (contextInfo.participant) key.participant = contextInfo.participant;

  return { key, message: contextInfo.quotedMessage };
}

function detectMedia(source) {
  const content = unwrapContent(source);
  if (content.imageMessage) {
    return { type: 'image', message: content.imageMessage, animated: false };
  }

  if (content.videoMessage) {
    // WhatsApp sends ordinary videos and GIF-style animations as videoMessage.
    // Both become short animated stickers; GIF playback is not lost.
    return {
      type: content.videoMessage.gifPlayback ? 'gif' : 'video',
      message: content.videoMessage,
      animated: true,
    };
  }

  if (content.documentMessage) {
    const mime = String(content.documentMessage.mimetype || '').toLowerCase();
    if (mime === 'image/gif') {
      return { type: 'gif', message: content.documentMessage, animated: true };
    }
    if (mime.startsWith('video/')) {
      return { type: 'video', message: content.documentMessage, animated: true };
    }
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)) {
      return { type: 'image', message: content.documentMessage, animated: false };
    }
  }

  return null;
}

async function makeStaticSticker(buffer) {
  // WhatsApp static stickers are expected to stay compact. Try a few encodings
  // before failing, while preserving the image ratio and avoiding crop/padding.
  const attempts = [
    { size: 512, quality: 86 },
    { size: 512, quality: 78 },
    { size: 480, quality: 74 },
    { size: 448, quality: 68 },
    { size: 384, quality: 62 },
    { size: 320, quality: 55 },
    { size: 288, quality: 48 },
    { size: 256, quality: 42 },
    { size: 224, quality: 35 },
  ];

  let smallest = null;
  for (const attempt of attempts) {
    const encoded = await sharp(buffer, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({
        width: attempt.size,
        height: attempt.size,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .webp({ quality: attempt.quality, effort: 6, smartSubsample: true })
      .toBuffer();

    if (!smallest || encoded.length < smallest.length) smallest = encoded;
    if (encoded.length <= MAX_STATIC_STICKER_BYTES) return encoded;
  }

  if (smallest && smallest.length <= MAX_STATIC_STICKER_BYTES) return smallest;
  throw new Error('This image could not be compressed below WhatsApp’s 100 KB static-sticker limit. Try a smaller image.');
}

module.exports = {
  command: 'sticker',
  aliases: ['s', 'st', 'stk', 'stik'],
  category: 'media',
  description: 'Convert a replied image, short video, or GIF into a sticker',
  usage: '-sticker or -s (reply to an image, video, or GIF)',
  cooldown: 1500,

  async handler(sock, msg, args = [], context = {}) {
    const from = context.chatId || msg?.key?.remoteJid;
    if (!from || !msg?.key) return;

    const source = getQuotedMessage(msg) || msg;
    const media = detectMedia(source);

    if (!media) {
      return sock.sendMessage(from, {
        text: '🖼️ Reply to an image, short video, or GIF with -s or -sticker.\n\nImages become static stickers. Videos/GIFs become animated stickers (up to 6 seconds).',
      }, { quoted: msg });
    }

    try {
      const advertisedSize = Number(media.message?.fileLength || 0);
      if (Number.isFinite(advertisedSize) && advertisedSize > MAX_INPUT_BYTES) {
        throw new Error('Source media exceeds 25 MB. Send a smaller image/video/GIF.');
      }

      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

      const buffer = await downloadMediaMessage(
        source,
        'buffer',
        {},
        {
          logger: console,
          reuploadRequest: typeof sock.updateMediaMessage === 'function'
            ? sock.updateMediaMessage.bind(sock)
            : undefined,
        }
      );

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('WhatsApp returned an empty media file.');
      }
      if (buffer.length > MAX_INPUT_BYTES) {
        throw new Error('Source media exceeds 25 MB. Send a smaller image/video/GIF.');
      }

      const stickerBuffer = media.animated
        ? await animatedWebpFromBuffer(buffer, {
            maxDuration: Math.min(MAX_ANIMATED_SECONDS, Math.max(1, Number(media.message?.seconds) || MAX_ANIMATED_SECONDS)),
            maxBytes: 500 * 1024,
          })
        : await makeStaticSticker(buffer);

      if (!Buffer.isBuffer(stickerBuffer) || stickerBuffer.length < 16) {
        throw new Error('Sticker conversion returned an invalid WebP file.');
      }

      await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (error) {
      console.error('[STICKER]', error?.stack || error);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await sock.sendMessage(from, {
        text: `❌ Sticker conversion failed: ${String(error?.message || 'unknown error').slice(0, 350)}`,
      }, { quoted: msg }).catch(() => {});
    }
  },
};
