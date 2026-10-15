'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const settings = require('../settings');
const isOwnerAsync = require('../lib/isOwner');
const { ASSET_DIR, stageAndCommit } = require('../lib/menuMedia');

const execFileAsync = promisify(execFile);
const MAX_SECONDS = 8;
const IMAGE_SECONDS = 4;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

const { getFfmpegPath } = require('../lib/ffmpegPath');

function ffmpegPath() {
  return getFfmpegPath() || 'ffmpeg';
}

function hasFfmpegExecutable(executable) {
  try {
    if (executable !== 'ffmpeg') return isExecutableFile(executable);
    const probe = require('child_process').spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: false });
    return !probe.error && probe.status === 0;
  } catch {
    return false;
  }
}

function imageExtension(mimetype = '') {
  const type = String(mimetype).toLowerCase().split(';')[0].trim();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'jpg';
}

function unwrapMessage(message) {
  let current = message;
  for (let i = 0; i < 8 && current; i++) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else break;
  }
  return current;
}

function quoteMedia(message) {
  const contextInfo = message?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessageV2?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.viewOnceMessageV2Extension?.message?.extendedTextMessage?.contextInfo;
  const quoted = unwrapMessage(contextInfo?.quotedMessage);
  if (!quoted) return null;

  if (quoted.videoMessage) {
    return {
      type: quoted.videoMessage.gifPlayback ? 'gif' : 'video',
      downloadType: 'video',
      message: quoted.videoMessage,
    };
  }

  if (quoted.imageMessage) {
    const mimetype = String(quoted.imageMessage.mimetype || '').toLowerCase();
    if (mimetype.startsWith('image/gif')) {
      return { type: 'gif', downloadType: 'image', message: quoted.imageMessage };
    }
    return { type: 'image', downloadType: 'image', message: quoted.imageMessage };
  }

  return null;
}

async function downloadQuotedMedia(mediaMessage, streamType) {
  const stream = await downloadContentFromMessage(mediaMessage, streamType);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('Downloaded media is empty.');
  return buffer;
}

async function convertAnimatedToMp4(inputBuffer, inputType, sourceMessage, workDir) {
  const mimetype = String(sourceMessage?.mimetype || '').toLowerCase();
  const inputExt = mimetype === 'image/gif' ? 'gif' : 'mp4';
  const inputPath = path.join(workDir, `bot-top-input-${Date.now()}.${inputExt}`);
  const outputPath = path.join(workDir, `bot-top-output-${Date.now()}.mp4`);
  fs.writeFileSync(inputPath, inputBuffer);

  const sourceSeconds = Number(sourceMessage?.seconds);
  const isLikelyMp4Video = inputType !== 'image' &&
    (mimetype === 'video/mp4' || Boolean(sourceMessage?.gifPlayback) || !mimetype);

  const executable = ffmpegPath();
  const canUseFfmpeg = hasFfmpegExecutable(executable);

  if (inputType !== 'image' && isLikelyMp4Video && !canUseFfmpeg &&
      (!Number.isFinite(sourceSeconds) || sourceSeconds <= MAX_SECONDS) &&
      inputBuffer.length <= MAX_OUTPUT_BYTES) {
    fs.writeFileSync(outputPath, inputBuffer);
    try {
      const stat = fs.statSync(outputPath);
      if (stat.size <= 0) throw new Error('The video file is empty.');
      return outputPath;
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
    }
  }

  if (!canUseFfmpeg) {
    throw new Error('FFmpeg is unavailable. Install system ffmpeg on the host or set FFMPEG_PATH to a working executable.');
  }

  const vf = [
    'scale=720:720:force_original_aspect_ratio=decrease',
    'pad=720:720:(ow-iw)/2:(oh-ih)/2',
    'format=yuv420p',
  ].join(',');

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (inputType === 'image') args.push('-loop', '1', '-i', inputPath, '-t', String(IMAGE_SECONDS));
  else args.push('-i', inputPath, '-t', String(MAX_SECONDS));
  args.push(
    '-vf', vf,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-level', '3.1',
    '-pix_fmt', 'yuv420p',
    '-r', '24',
    '-b:v', '650k',
    '-maxrate', '700k',
    '-bufsize', '1400k',
    '-movflags', '+faststart',
    outputPath,
  );

  try {
    await execFileAsync(executable, args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    const stat = fs.statSync(outputPath);
    if (stat.size <= 0) throw new Error('FFmpeg produced an empty file.');
    if (stat.size > MAX_OUTPUT_BYTES) throw new Error('The converted menu video is too large. Use a shorter/smaller media file.');
    return outputPath;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('FFmpeg executable was not found. Install ffmpeg on KataBump or set FFMPEG_PATH to a working binary.');
    }
    throw error;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
  }
}

module.exports = {
  command: 'setbottop',
  aliases: ['settop', 'botmedia'],
  category: 'owner',
  ownerOnly: true,
  description: 'Change the media shown with all ABIX menus (owner or secondary owner)',
  usage: `${settings.prefixes[0] || '-'}setbottop (reply to an image, GIF, or short video)`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || message.key.remoteJid;

    let ownerAuthorized = Boolean(context.isOwner);
    if (!ownerAuthorized) {
      try { ownerAuthorized = await isOwnerAsync(senderId, sock, chatId); }
      catch { ownerAuthorized = false; }
    }

    if (!ownerAuthorized) {
      return sock.sendMessage(chatId, {
        text: '❌ Only the bot owner or secondary owner can change the menu media.',
      }, { quoted: message });
    }

    const quoted = quoteMedia(message);
    if (!quoted) {
      return sock.sendMessage(chatId, {
        text: `⚠️ Reply to an *image*, *GIF*, or *short video* with *${settings.prefixes[0] || '-'}setbottop*.\n\nImage → stays an image\nGIF → stays a GIF\nVideo → stays a video\n\nThe selected media will be used by the main and dedicated menu senders.`,
      }, { quoted: message });
    }

    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const workDir = path.join(ASSET_DIR, '.setbottop-tmp');
    fs.mkdirSync(workDir, { recursive: true });

    let tempOutput = null;
    try {
      const buffer = await downloadQuotedMedia(quoted.message, quoted.downloadType);

      if (quoted.type === 'image') {
        const inputPath = path.join(workDir, `bot-top-image-${Date.now()}.${imageExtension(quoted.message?.mimetype)}`);
        fs.writeFileSync(inputPath, buffer);
        tempOutput = inputPath;
        stageAndCommit({
          type: 'image',
          buffer,
          mimetype: quoted.message?.mimetype || 'image/jpeg',
          workDir,
          updatedBy: senderId,
        });
      } else {
        tempOutput = await convertAnimatedToMp4(buffer, quoted.type === 'gif' ? 'video' : quoted.type, quoted.message, workDir);
        const output = fs.readFileSync(tempOutput);
        stageAndCommit({
          type: quoted.type,
          buffer: output,
          mimetype: 'video/mp4',
          workDir,
          updatedBy: senderId,
        });
      }

      const kind = quoted.type === 'image' ? 'image' : quoted.type === 'gif' ? 'GIF' : 'video';
      return sock.sendMessage(chatId, {
        text: `✅ Menu media updated successfully.\n\n🎞️ Type: *${kind}*\n📁 Managed menu asset updated.\n\nAll menu senders now use the same current menu media.\n\nSend *${settings.prefixes[0] || '-'}menu* to test it.`,
      }, { quoted: message });
    } catch (error) {
      console.error('[SETBOTTOP]', error);
      return sock.sendMessage(chatId, {
        text: `❌ Failed to update menu media.\n\n${error.message}\n\nThe previous menu media was kept unchanged.`,
      }, { quoted: message });
    } finally {
      if (tempOutput && fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(tempOutput); } catch {}
      }
      try {
        for (const entry of fs.readdirSync(workDir)) fs.unlinkSync(path.join(workDir, entry));
        fs.rmdirSync(workDir);
      } catch {}
    }
  },
};
