'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadFile, formatBytes, MAX_BYTES, safeFilename } = require('../lib/gofileUpload.cjs');

const TMP_DIR = path.join(process.env.TMPDIR || os.tmpdir(), 'abix-gofileup');
const SUPPORTED = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage'
]);

function unwrapMessage(message) {
  if (!message || typeof message !== 'object') return null;

  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);

  for (const [type, value] of Object.entries(message)) {
    if (SUPPORTED.has(type) && value) return { type, content: value };
  }
  return null;
}

function getQuotedMessage(commandMessage) {
  const contextInfo =
    commandMessage?.message?.extendedTextMessage?.contextInfo ||
    commandMessage?.message?.imageMessage?.contextInfo ||
    commandMessage?.message?.videoMessage?.contextInfo ||
    commandMessage?.message?.documentMessage?.contextInfo ||
    commandMessage?.message?.buttonsResponseMessage?.contextInfo ||
    commandMessage?.message?.listResponseMessage?.contextInfo ||
    {};

  return contextInfo.quotedMessage || null;
}

function mediaTypeForMessageType(type) {
  switch (type) {
    case 'imageMessage': return 'image';
    case 'videoMessage': return 'video';
    case 'audioMessage': return 'audio';
    case 'documentMessage': return 'document';
    case 'stickerMessage': return 'sticker';
    default: return null;
  }
}

function filenameFor(type, content) {
  if (content?.fileName) return safeFilename(content.fileName);

  const mime = String(content?.mimetype || '').toLowerCase();
  const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg'
  };

  const ext = extMap[mime] || {
    imageMessage: '.jpg',
    videoMessage: '.mp4',
    audioMessage: '.mp3',
    stickerMessage: '.webp',
    documentMessage: '.bin'
  }[type] || '.bin';

  return `abix_${Date.now()}${ext}`;
}

async function streamQuotedMediaToDisk(media, outputPath) {
  const stream = await downloadContentFromMessage(media.content, mediaTypeForMessageType(media.type));
  const file = fs.createWriteStream(outputPath, { flags: 'wx' });
  let total = 0;

  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BYTES) {
        file.destroy();
        throw new Error(`File exceeds the -gofileup limit of ${formatBytes(MAX_BYTES)}.`);
      }
      if (!file.write(buf)) {
        await new Promise((resolve, reject) => {
          file.once('drain', resolve);
          file.once('error', reject);
        });
      }
    }

    await new Promise((resolve, reject) => {
      file.end((err) => err ? reject(err) : resolve());
    });
  } catch (error) {
    file.destroy();
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  }

  return total;
}

async function ensureTempDir() {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
}

async function cleanup(filePath) {
  if (filePath) await fs.promises.unlink(filePath).catch(() => {});
}

module.exports = {
  command: 'gofileup',
  aliases: ['gfu', 'gofup', 'gofileupload'],
  category: 'upload',
  description: 'Upload a replied WhatsApp file/media to GoFile and reply with the completed upload link.',
  usage: '.gofileup (reply to an image, video, audio, sticker, or document)',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let tempPath = null;

    try {
      const quotedRaw = getQuotedMessage(message);
      const media = unwrapMessage(quotedRaw);

      if (!media) {
        return await sock.sendMessage(chatId, {
          text: '⚠️ *Reply to a file/media with `-gofileup`.*\n\nSupported: image, video, audio, sticker, and document.'
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, {
        react: { text: '⏳', key: message.key }
      }).catch(() => {});

      await ensureTempDir();
      const filename = filenameFor(media.type, media.content);
      tempPath = path.join(TMP_DIR, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${filename}`);

      // Download the WhatsApp media first, then upload it to GoFile.
      // The temporary file is deleted immediately after the upload finishes.
      const downloadedBytes = await streamQuotedMediaToDisk(media, tempPath);

      const result = await uploadFile(tempPath, {
        filename,
        contentType: media.content?.mimetype || 'application/octet-stream'
      });

      const sizeText = formatBytes(downloadedBytes);
      const lines = [
        '✅ *GoFile Upload Complete*',
        '',
        `📄 *File:* ${filename}`,
        `📦 *Size:* ${sizeText}`,
        `☁️ *Service:* GoFile`,
        '',
        `🔗 *Download:* ${result.downloadPage}`
      ];

      if (result.directLink) {
        lines.push('', `⚡ *Direct:* ${result.directLink}`);
      }

      await sock.sendMessage(chatId, {
        text: lines.join('\n')
      }, { quoted: message });

      await sock.sendMessage(chatId, {
        react: { text: '✅', key: message.key }
      }).catch(() => {});
    } catch (error) {
      console.error('[GOFILEUP]', error?.message || error);
      await sock.sendMessage(chatId, {
        react: { text: '❌', key: message.key }
      }).catch(() => {});
      await sock.sendMessage(chatId, {
        text: `❌ *GoFile upload failed*\n\n${String(error?.message || error).slice(0, 1000)}`
      }, { quoted: message }).catch(() => {});
    } finally {
      await cleanup(tempPath);
    }
  }
};
