const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const sharp = require('sharp');
const execFilePromise = util.promisify(execFile);

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: process.env.NEWSLETTER_JID || '120363413637544342@newsletter',
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

async function downloadSticker(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const stickerMessage = quoted?.stickerMessage || message.message?.stickerMessage;
  if (!stickerMessage) return null;

  const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function ffmpegToMp4(gifPath, outPath, ffmpegCmd) {
  await execFilePromise(ffmpegCmd, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', gifPath,
    '-an',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-t', '6',
    outPath
  ], { maxBuffer: 8 * 1024 * 1024 });

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('FFmpeg produced an empty MP4.');
  }
  return fs.readFileSync(outPath);
}

module.exports = {
  command: 'sticker2gif',
  aliases: ['s2g', 's2gif', 's2v', 'stogif', 'tomp4', 'stickertomp4'],
  category: 'media',
  description: 'Convert a WhatsApp sticker to a playable GIF/video',
  usage: '.sticker2gif (reply to a sticker)',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    let inputPath = null;
    let gifPath = null;
    let outPath = null;

    try {
      const buffer = await downloadSticker(message);
      if (!buffer?.length) {
        return await sock.sendMessage(chatId, {
          text: '❌ Kisi sticker ko reply karein.\nPlease reply to a sticker.',
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const tmpDir = path.join(process.cwd(), 'tmp');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      inputPath = path.join(tmpDir, `s2g_${id}.webp`);
      gifPath = path.join(tmpDir, `s2g_${id}.gif`);
      outPath = path.join(tmpDir, `s2g_${id}.mp4`);
      await fs.promises.writeFile(inputPath, buffer);

      const { requireFfmpegPath } = require('../lib/ffmpegPath');
      const ffmpegCmd = requireFfmpegPath();

      // Sharp/libwebp reliably decodes both animated and static WebP.
      // For animated stickers, preserve all pages/frames instead of collapsing them.
      const image = sharp(buffer, { animated: true, pages: -1 });
      const metadata = await image.metadata();
      const pages = Number(metadata.pages || 1);

      await image
        .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .gif({ loop: 0, effort: 4 })
        .toFile(gifPath);

      // A static sticker is still converted to a playable 1-frame GIF/video;
      // animated stickers keep their frames.
      const mp4Buffer = await ffmpegToMp4(gifPath, outPath, ffmpegCmd);

      await sock.sendMessage(chatId, {
        video: mp4Buffer,
        caption: pages > 1
          ? `🎞️ *Sticker → GIF*\nFrames: ${pages}\n📢 ABIX-AE`
          : '🎞️ *Sticker → GIF*\n📢 ABIX-AE',
        gifPlayback: true,
        mimetype: 'video/mp4',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
      console.error('[STICKER2GIF]', error);
      try { await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }); } catch {}
      await sock.sendMessage(chatId, {
        text: `❌ *Sticker → GIF failed*\n${error.message || 'Conversion failed.'}`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    } finally {
      for (const file of [inputPath, gifPath, outPath]) {
        if (file) {
          try { await fs.promises.unlink(file); } catch {}
        }
      }
    }
  }
};
