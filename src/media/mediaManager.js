import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);
const TMP_DIR = path.join(os.tmpdir(), 'whatsapp-ai-bot-media');

async function ensureTmp() { await fs.mkdir(TMP_DIR, { recursive: true }); }

export function getQuotedMessage(msg) {
  return msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

export function findMedia(msg, { includeSticker = true } = {}) {
  const direct = msg?.message || null;
  const quoted = getQuotedMessage(msg);
  for (const container of [direct, quoted]) {
    if (!container) continue;
    if (container.imageMessage) return { type: 'image', message: container.imageMessage };
    if (container.videoMessage) return { type: container.videoMessage.gifPlayback ? 'gif' : 'video', message: container.videoMessage };
    if (includeSticker && container.stickerMessage) return { type: 'sticker', message: container.stickerMessage };
  }
  return null;
}

export async function downloadMedia(type, message) {
  const streamType = type === 'sticker' ? 'sticker' : (type === 'gif' || type === 'video' ? 'video' : 'image');
  const stream = await downloadContentFromMessage(message, streamType);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('Downloaded media is empty.');
  return buffer;
}

async function ffmpeg(input, output, args) {
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, ...args, output], { maxBuffer: 1024 * 1024 * 10 });
}

export async function imageToSticker(buffer) {
  await ensureTmp();
  const base = path.join(TMP_DIR, randomUUID());
  const input = `${base}.input`;
  const output = `${base}.webp`;
  await fs.writeFile(input, buffer);
  try {
    await ffmpeg(input, output, ['-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '75', '-preset', 'picture', '-an', '-f', 'webp']);
    return await fs.readFile(output);
  } finally { await Promise.allSettled([fs.unlink(input), fs.unlink(output)]); }
}

export async function videoToAnimatedSticker(buffer, maxSeconds = config.media.maxStickerVideoSeconds) {
  await ensureTmp();
  const base = path.join(TMP_DIR, randomUUID());
  const input = `${base}.input`;
  const output = `${base}.webp`;
  await fs.writeFile(input, buffer);
  try {
    await ffmpeg(input, output, ['-t', String(maxSeconds), '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0', '-vcodec', 'libwebp', '-loop', '0', '-an', '-f', 'webp']);
    return await fs.readFile(output);
  } finally { await Promise.allSettled([fs.unlink(input), fs.unlink(output)]); }
}

export async function stickerToImage(buffer, animated = false) {
  await ensureTmp();
  const base = path.join(TMP_DIR, randomUUID());
  const input = `${base}.webp`;
  const output = `${base}.${animated ? 'gif' : 'png'}`;
  await fs.writeFile(input, buffer);
  try {
    if (animated) {
      await ffmpeg(input, output, ['-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0', '-f', 'gif']);
    } else {
      await ffmpeg(input, output, ['-frames:v', '1', '-f', 'image2']);
    }
    return { buffer: await fs.readFile(output), type: animated ? 'gif' : 'image' };
  } finally { await Promise.allSettled([fs.unlink(input), fs.unlink(output)]); }
}

export function validateSize(buffer, type) {
  const mb = buffer.length / 1024 / 1024;
  const limit = type === 'image' ? config.media.maxImageMb : config.media.maxVideoMb;
  if (mb > limit) throw new Error(`Media is ${mb.toFixed(1)} MB; maximum is ${limit} MB.`);
}
