const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const TMP_ROOT = path.join(process.cwd(), 'tmp', 'ezgif');
const MAX_INPUT = 32 * 1024 * 1024;
const MAX_OUTPUT = 32 * 1024 * 1024;

function run(binary, args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${binary} timed out after ${Math.round(timeout / 1000)}s`));
    }, timeout);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`${binary} failed${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function tempDir() {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(TMP_ROOT, 'job-'));
}

function removeDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function quotedTarget(message) {
  const context = message?.message?.extendedTextMessage?.contextInfo;
  if (!context?.quotedMessage) return null;
  return {
    key: {
      remoteJid: message.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant,
    },
    message: context.quotedMessage,
  };
}

function mediaType(message) {
  const value = message?.message || {};
  if (value.imageMessage) return { kind: 'image', ext: 'jpg' };
  if (value.videoMessage) return { kind: 'video', ext: 'mp4' };
  if (value.audioMessage) return { kind: 'audio', ext: 'ogg' };
  if (value.documentMessage?.mimetype?.startsWith('image/')) return { kind: 'image', ext: 'jpg' };
  if (value.documentMessage?.mimetype?.startsWith('video/')) return { kind: 'video', ext: 'mp4' };
  return null;
}

async function inputFile(message, dir, preferredKind) {
  const target = mediaType(message) ? message : quotedTarget(message);
  const info = mediaType(target);
  if (!target || !info || (preferredKind && info.kind !== preferredKind)) {
    throw new Error(`Reply to a ${preferredKind || 'supported image or video'} and try again.`);
  }
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined });
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Media download failed.');
  if (buffer.length > MAX_INPUT) throw new Error('Input file is larger than the 32 MB limit.');
  const file = path.join(dir, `input.${info.ext}`);
  fs.writeFileSync(file, buffer);
  return { file, info };
}

async function mediaJob(sock, message, context, preferredKind, operation) {
  const chatId = context.chatId || message.key.remoteJid;
  const dir = tempDir();
  try {
    const input = await inputFile(message, dir, preferredKind);
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
    const result = await operation(input, dir);
    const stat = fs.statSync(result.file);
    if (stat.size > MAX_OUTPUT) throw new Error('Generated file is larger than the 32 MB limit.');
    await sock.sendMessage(chatId, {
      [result.type]: fs.readFileSync(result.file),
      mimetype: result.mime,
      fileName: path.basename(result.file),
      caption: result.caption,
    }, { quoted: message });
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (error) {
    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
    throw error;
  } finally {
    removeDir(dir);
  }
}

function command(command, description, usage, handler, aliases = []) {
  return { command, aliases, category: 'ezgif', description, usage, handler };
}

const commands = [
  command('ezgifmenu', 'Show EZGIF-style media tools', '.ezgifmenu', async (sock, message, args, context) => {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, {
      text: [
        '╭───「 🎞️ EZGIF MEDIA MENU 」',
        '└ .mp4 — GIF/video to MP4',
        '└ .mp3 — Extract audio from video',
        '└ .webm — Convert video to WebM',
        '└ .resize <width> — Resize image/video',
        '└ .cut <start> <duration> — Cut video',
        '└ .speed <0.25-4> — Change video speed',
        '└ .compress — Compress image/video',
        '└ .rotate <90|180|270> — Rotate media',
        '╰───────────────○',
      ].join('\n'),
    }, { quoted: message });
  }),
  command('mp4', 'Convert GIF or video to MP4', '.mp4', (s, m, a, c) => mediaJob(s, m, c, 'video', async ({ file }, dir) => {
    const output = path.join(dir, 'output.mp4');
    await run('ffmpeg', ['-y', '-i', file, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', output]);
    return { file: output, type: 'video', mime: 'video/mp4', caption: '🎬 GIF/video → MP4' };
  }), ['m4', 'g2m', 'giftomp4', 'giftovideo']),
  command('mp3', 'Extract audio from a video', '.mp3', (s, m, a, c) => mediaJob(s, m, c, 'video', async ({ file }, dir) => {
    const output = path.join(dir, 'output.mp3');
    await run('ffmpeg', ['-y', '-i', file, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', output]);
    return { file: output, type: 'audio', mime: 'audio/mpeg', caption: '🎵 Video → MP3' };
  }), ['m3', 'v2a', 'videotomp3']),
  command('webm', 'Convert a video to WebM', '.webm', (s, m, a, c) => mediaJob(s, m, c, 'video', async ({ file }, dir) => {
    const output = path.join(dir, 'output.webm');
    await run('ffmpeg', ['-y', '-i', file, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-an', output]);
    return { file: output, type: 'video', mime: 'video/webm', caption: '🌐 Video → WebM' };
  }), ['wm', 'giftowebm']),
  command('resize', 'Resize media by width', '.resize <width>', async (s, m, a, c) => {
    const width = Number(a[0]);
    if (!Number.isInteger(width) || width < 16 || width > 4096) throw new Error('Usage: .resize <16-4096>');
    return mediaJob(s, m, c, null, async ({ file, info }, dir) => {
      const output = path.join(dir, info.kind === 'video' ? 'resize.mp4' : 'resize.jpg');
      await run('ffmpeg', ['-y', '-i', file, '-vf', `scale=${width}:-2`, ...(info.kind === 'video' ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : []), output]);
      return { file: output, type: info.kind === 'video' ? 'video' : 'image', mime: info.kind === 'video' ? 'video/mp4' : 'image/jpeg', caption: `📐 Resized to ${width}px` };
    });
  }, ['rs', 'resizeimage', 'resizevideo']),
  command('cut', 'Cut a video by start and duration', '.cut <start> <duration>', async (s, m, a, c) => {
    if (!a[0] || !a[1]) throw new Error('Usage: .cut 00:00:05 00:00:10');
    return mediaJob(s, m, c, 'video', async ({ file }, dir) => {
      const output = path.join(dir, 'cut.mp4');
      await run('ffmpeg', ['-y', '-ss', a[0], '-i', file, '-t', a[1], '-c', 'copy', output]);
      return { file: output, type: 'video', mime: 'video/mp4', caption: '✂️ Video cut' };
    });
  }, ['ct', 'cutvideo']),
  command('speed', 'Change video speed', '.speed <0.25-4>', async (s, m, a, c) => {
    const speed = Number(a[0]);
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error('Usage: .speed <0.25-4>');
    return mediaJob(s, m, c, 'video', async ({ file }, dir) => {
      const output = path.join(dir, 'speed.mp4');
      await run('ffmpeg', ['-y', '-i', file, '-filter:v', `setpts=${1 / speed}*PTS`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output]);
      return { file: output, type: 'video', mime: 'video/mp4', caption: `⚡ Speed ×${speed}` };
    });
  }, ['sp', 'videospeed']),
  command('compress', 'Compress an image or video', '.compress', (s, m, a, c) => mediaJob(s, m, c, null, async ({ file, info }, dir) => {
    const output = path.join(dir, info.kind === 'video' ? 'compressed.mp4' : 'compressed.jpg');
    await run('ffmpeg', ['-y', '-i', file, ...(info.kind === 'video' ? ['-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k'] : ['-q:v', '7']), output]);
    return { file: output, type: info.kind === 'video' ? 'video' : 'image', mime: info.kind === 'video' ? 'video/mp4' : 'image/jpeg', caption: '🗜️ Media compressed' };
  }), ['cmp', 'videocompressor', 'compresspng', 'compressjpg']),
  command('rotate', 'Rotate media', '.rotate <90|180|270>', async (s, m, a, c) => {
    const deg = Number(a[0] || 90);
    const filter = deg === 90 ? 'transpose=1' : deg === 270 ? 'transpose=2' : deg === 180 ? 'transpose=1,transpose=1' : null;
    if (!filter) throw new Error('Usage: .rotate <90|180|270>');
    return mediaJob(s, m, c, null, async ({ file, info }, dir) => {
      const output = path.join(dir, info.kind === 'video' ? 'rotate.mp4' : 'rotate.jpg');
      await run('ffmpeg', ['-y', '-i', file, '-vf', filter, ...(info.kind === 'video' ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : []), output]);
      return { file: output, type: info.kind === 'video' ? 'video' : 'image', mime: info.kind === 'video' ? 'video/mp4' : 'image/jpeg', caption: `🔃 Rotated ${deg}°` };
    });
  }, ['rot', 'rotatevideo']),
];

module.exports = commands;
