import sharp from 'sharp';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const MAX_INPUT_BYTES = 35 * 1024 * 1024;
const MAX_STATIC_STICKER_BYTES = 100 * 1024;
const MAX_ANIMATED_STICKER_BYTES = 500 * 1024;

function findFfmpeg() {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    const bundled = require('ffmpeg-static');
    if (typeof bundled === 'string' && bundled.trim()) return bundled;
  } catch {}
  return 'ffmpeg';
}

async function react(sock, msg, emoji) {
  try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 6 && current; i += 1) {
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current || {};
}

function findContextInfo(message) {
  let current = message;
  for (let i = 0; i < 6 && current; i += 1) {
    const unwrapped = unwrap(current);
    for (const value of Object.values(unwrapped)) {
      if (value?.contextInfo?.quotedMessage) return value.contextInfo;
    }
    current = unwrapped;
  }
  return null;
}

function makeQuotedMessage(msg) {
  const context = findContextInfo(msg?.message);
  if (!context?.quotedMessage || !context?.stanzaId) return null;
  return {
    key: {
      remoteJid: msg.key.remoteJid,
      fromMe: Boolean(context.fromMe),
      id: context.stanzaId,
      participant: context.participant || undefined,
    },
    message: context.quotedMessage,
  };
}

function mediaKind(target) {
  const content = unwrap(target?.message);
  if (content.imageMessage) return 'image';
  if (content.videoMessage) return 'video';
  return null;
}

async function encodeImage(buffer) {
  const base = sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 }).rotate();
  for (const quality of [86, 74, 62, 50, 40, 30, 22]) {
    const result = await base.clone()
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (result.length <= MAX_STATIC_STICKER_BYTES || quality === 22) {
      if (result.length > MAX_STATIC_STICKER_BYTES) throw new Error('Image sticker is still larger than WhatsApp’s 100 KB limit after compression. Try a smaller or simpler image.');
      return result;
    }
  }
  throw new Error('Could not encode this image as a sticker.');
}

async function runFfmpeg(ffmpeg, inputPath, outputPath, config, codec) {
  const filter = [
    `fps=${config.fps}`,
    'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos',
    'format=yuva420p',
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
    'format=yuva420p',
  ].join(',');
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-t', String(config.seconds), '-an', '-vf', filter,
    '-loop', '0', '-c:v', codec, '-preset', 'default',
    '-quality', String(config.quality), '-compression_level', '5',
    '-threads', '2', outputPath,
  ];
  await execFileAsync(ffmpeg, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
}

async function encodeVideo(buffer, tempDir) {
  const inputPath = path.join(tempDir, 'input-video');
  const outputPath = path.join(tempDir, 'animated-sticker.webp');
  await fs.writeFile(inputPath, buffer);
  const ffmpeg = findFfmpeg();
  const configs = [
    { fps: 12, seconds: 6, quality: 55 },
    { fps: 10, seconds: 4.5, quality: 42 },
    { fps: 8, seconds: 3.5, quality: 30 },
  ];
  let lastError;
  for (const config of configs) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    try {
      try {
        await runFfmpeg(ffmpeg, inputPath, outputPath, config, 'libwebp_anim');
      } catch (error) {
        const message = `${error?.stderr || ''} ${error?.message || ''}`;
        if (/unknown encoder|encoder .* not found|unsupported codec/i.test(message)) {
          await fs.rm(outputPath, { force: true }).catch(() => {});
          await runFfmpeg(ffmpeg, inputPath, outputPath, config, 'libwebp');
        } else {
          throw error;
        }
      }
      const output = await fs.readFile(outputPath);
      if (output.length <= MAX_ANIMATED_STICKER_BYTES) return output;
      lastError = new Error('Animated sticker is still larger than WhatsApp’s 500 KB limit after compression.');
    } catch (error) {
      lastError = error;
      const message = `${error?.stderr || ''} ${error?.message || ''}`;
      if (/spawn .*ffmpeg.* enoent|not found|no such file or directory/i.test(message)) {
        throw new Error('FFmpeg is missing. Install ffmpeg on the server or set FFMPEG_PATH in .env.');
      }
    }
  }
  throw lastError || new Error('Video could not be converted into an animated WebP sticker.');
}

export default {
  name: 'sticker',
  aliases: ['s', 'stik'],
  description: 'Image, GIF, or short video ko sticker mein convert karein',
  category: 'media',
  noPrefix: true,

  async execute({ sock, msg, from, args }) {
    const chat = from || msg?.key?.remoteJid;
    if (!chat || !msg?.key) return;

    const quotedMessage = makeQuotedMessage(msg);
    const target = quotedMessage || msg;
    const kind = mediaKind(target);
    if (!kind) {
      await sock.sendMessage(chat, {
        text: '🖼️ Image, GIF, ya short video par reply karke *-sticker* likho. Shortcut: *-s*',
      }, { quoted: msg });
      return;
    }

    let tempDir;
    try {
      await react(sock, msg, '⏳');
      const buffer = await downloadMediaMessage(target, 'buffer', {}, {
        logger: console,
        reuploadRequest: (message) => sock.updateMediaMessage(message),
      });
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('WhatsApp media download returned an empty file.');
      if (buffer.length > MAX_INPUT_BYTES) throw new Error('Media is too large. Please use a file smaller than 35 MB.');

      let stickerBuffer;
      if (kind === 'image') {
        stickerBuffer = await encodeImage(buffer);
      } else {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abix-sticker-'));
        stickerBuffer = await encodeVideo(buffer, tempDir);
      }

      await sock.sendMessage(chat, { sticker: stickerBuffer }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (error) {
      console.error('[STICKER] Conversion failed:', error?.stack || error);
      await react(sock, msg, '❌');
      let message = String(error?.message || 'unknown error');
      if (/403|timed out|decrypt|media.*download/i.test(message)) {
        message = 'WhatsApp media could not be downloaded. Try replying to the original media again.';
      }
      await sock.sendMessage(chat, {
        text: `❌ Sticker error: ${message.slice(0, 220)}`,
      }, { quoted: msg }).catch(() => {});
    } finally {
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
