'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadFile, formatBytes, MAX_BYTES, safeFilename } = require('../lib/dropboxUpload.cjs');

const TMP_DIR = path.join(process.env.TMPDIR || os.tmpdir(), 'abix-dropboxup');
const SUPPORTED = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);
const DISK_RESERVE_BYTES = 64 * 1024 * 1024;

async function ensureTempSpace(dir, requiredBytes = 0) {
  if (typeof fs.promises.statfs !== 'function') return;
  try {
    const stat = await fs.promises.statfs(dir);
    const free = Number(stat.bavail) * Number(stat.bsize);
    if (free < DISK_RESERVE_BYTES + Math.max(0, Number(requiredBytes) || 0)) {
      throw new Error(`Insufficient temporary disk space. Keep at least ${formatBytes(DISK_RESERVE_BYTES)} free while uploading.`);
    }
  } catch (error) {
    if (['ENOSYS', 'ENOTSUP', 'EINVAL'].includes(error?.code)) return;
    throw error;
  }
}

function unwrapMessage(message) {
  if (!message || typeof message !== 'object') return null;
  for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage']) {
    if (message[key]?.message) return unwrapMessage(message[key].message);
  }
  for (const [type, content] of Object.entries(message)) {
    if (SUPPORTED.has(type) && content) return { type, content };
  }
  return null;
}

function getQuotedMessage(commandMessage) {
  const contextInfo = commandMessage?.message?.extendedTextMessage?.contextInfo
    || commandMessage?.message?.imageMessage?.contextInfo
    || commandMessage?.message?.videoMessage?.contextInfo
    || commandMessage?.message?.documentMessage?.contextInfo
    || commandMessage?.message?.buttonsResponseMessage?.contextInfo
    || commandMessage?.message?.listResponseMessage?.contextInfo
    || {};
  return contextInfo.quotedMessage || null;
}

function mediaType(type) {
  return ({ imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', documentMessage: 'document', stickerMessage: 'sticker' })[type] || null;
}

function filenameFor(type, content) {
  if (content?.fileName) return safeFilename(content.fileName);
  const mime = String(content?.mimetype || '').toLowerCase();
  const extensions = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
    'audio/ogg': '.ogg', 'application/pdf': '.pdf', 'application/zip': '.zip',
  };
  const extension = extensions[mime] || ({ imageMessage: '.jpg', videoMessage: '.mp4', audioMessage: '.mp3', stickerMessage: '.webp', documentMessage: '.bin' })[type] || '.bin';
  return `abix_${Date.now()}${extension}`;
}

async function streamQuotedMediaToDisk(media, outputPath) {
  const stream = await downloadContentFromMessage(media.content, mediaType(media.type));
  const file = fs.createWriteStream(outputPath, { flags: 'wx' });
  let total = 0;
  let lastDiskCheck = 0;
  try {
    await ensureTempSpace(path.dirname(outputPath), Number(media.content?.fileLength || 0));
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_BYTES) {
        file.destroy();
        throw new Error(`File exceeds the -dropboxup limit of ${formatBytes(MAX_BYTES)}.`);
      }
      if (total - lastDiskCheck >= 16 * 1024 * 1024) {
        await ensureTempSpace(path.dirname(outputPath), 0);
        lastDiskCheck = total;
      }
      if (!file.write(buffer)) await new Promise((resolve, reject) => {
        file.once('drain', resolve);
        file.once('error', reject);
      });
    }
    await new Promise((resolve, reject) => file.end(error => error ? reject(error) : resolve()));
  } catch (error) {
    file.destroy();
    await fs.promises.rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
  if (!total) {
    await fs.promises.rm(outputPath, { force: true }).catch(() => {});
    throw new Error('The replied media downloaded as an empty file.');
  }
  return total;
}

module.exports = {
  command: 'dropboxup',
  aliases: ['dbup', 'dropboxupload'],
  category: 'upload',
  description: 'Upload replied WhatsApp media to the configured Dropbox account and return a share link.',
  usage: '-dropboxup (reply to a photo, video, audio, sticker, or document)',

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let temporaryPath = null;
    try {
      const media = unwrapMessage(getQuotedMessage(message));
      if (!media) {
        return sock.sendMessage(chatId, {
          text: '☁️ *DROPBOX UPLOAD*\n\nReply to a photo, video, audio, sticker, or document with `-dropboxup`.\n\nDropbox upload credentials must be configured in `.env`.'
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }).catch(() => {});
      await fs.promises.mkdir(TMP_DIR, { recursive: true });
      const filename = filenameFor(media.type, media.content);
      temporaryPath = path.join(TMP_DIR, `${Date.now()}_${crypto.randomBytes(5).toString('hex')}_${filename}`);
      const size = await streamQuotedMediaToDisk(media, temporaryPath);
      const result = await uploadFile(temporaryPath, {
        filename,
        contentType: media.content?.mimetype || 'application/octet-stream',
      });

      const lines = [
        '✅ *Dropbox Upload Complete*', '',
        `📄 *File:* ${result.filename || filename}`,
        `📦 *Size:* ${formatBytes(size)}`,
        `☁️ *Path:* ${result.path || '/' + filename}`,
        '', `🔗 *Share link:* ${result.sharedLink}`,
      ];
      if (result.directLink && result.directLink !== result.sharedLink) lines.push('', `⬇️ *Direct download:* ${result.directLink}`);
      await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});
    } catch (error) {
      console.error('[DROPBOXUP]', error?.message || error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
      await sock.sendMessage(chatId, {
        text: `❌ *Dropbox upload failed*\n\n${String(error?.message || error).slice(0, 900)}\n\nCheck Dropbox OAuth credentials and the \`files.content.write\` + \`sharing.write\` scopes.`
      }, { quoted: message }).catch(() => {});
    } finally {
      if (temporaryPath) await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    }
  },
};
