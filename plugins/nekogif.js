const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fileTypeApi = require('file-type');
const detectFileType = fileTypeApi.fileTypeFromBuffer || fileTypeApi.fromBuffer;
const nekoGroups = require('../lib/nekoGroups');
const settings = require('../settings');
const isOwner = require('../lib/isOwner');
const { animatedWebpFromBuffer } = require('../lib/sticker');

const execFileAsync = promisify(execFile);
const { requireFfmpegPath } = require('../lib/ffmpegPath');
const ENDPOINTS_URL = 'https://nekos.best/api/v2/endpoints';
const API_BASE = 'https://nekos.best/api/v2/';
const MAX_DOWNLOAD = 12 * 1024 * 1024;
const MAX_DURATION = 6;

function prefix() { return settings.prefixes?.[0] || '-'; }
function tempPath(ext) { return path.join(os.tmpdir(), `mybot-nekogif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`); }
async function cleanup(...files) { for (const file of files) { try { if (file) await fs.promises.unlink(file); } catch {} } }

async function fetchBuffer(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Invalid media URL');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25_000,
    maxContentLength: MAX_DOWNLOAD,
    maxBodyLength: MAX_DOWNLOAD,
    maxRedirects: 5,
    headers: { 'User-Agent': 'myBOT Nekogif (https://github.com/Jalalkhan96/Jalalkhan96)', Accept: '*/*' },
  });
  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > MAX_DOWNLOAD) throw new Error('Nekogif media is too large');
  return { buffer, contentType: String(response.headers['content-type'] || '').toLowerCase(), type: await detectFileType(buffer).catch(() => null) };
}

async function toPlayableMp4(input, inputType) {
  const inputPath = tempPath(inputType === 'gif' ? 'gif' : 'input');
  const outputPath = tempPath('mp4');
  await fs.promises.writeFile(inputPath, input);
  try {
    await execFileAsync(requireFfmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-an', '-t', String(MAX_DURATION),
      '-vf', 'fps=15,scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1,format=yuv420p',
      '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1',
      '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
      outputPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    const output = await fs.promises.readFile(outputPath);
    if (!output.length) throw new Error('Generated MP4 is empty');
    return output;
  } finally {
    await cleanup(inputPath, outputPath);
  }
}

async function getEndpoints() {
  const { data } = await axios.get(ENDPOINTS_URL, { timeout: 15_000, headers: { 'User-Agent': 'myBOT Nekogif (https://github.com/Jalalkhan96/Jalalkhan96)', Accept: 'application/json' } });
  return Object.entries(data || {}).filter(([, meta]) => meta?.format === 'gif').map(([name]) => name).filter(Boolean);
}

async function getRandomEndpoint() {
  const endpoints = await getEndpoints();
  if (!endpoints.length) throw new Error('No GIF categories are available');
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

async function getGif(category) {
  const safeCategory = String(category || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!safeCategory) throw new Error('GIF category required');
  const { data } = await axios.get(`${API_BASE}${encodeURIComponent(safeCategory)}`, {
    timeout: 20_000,
    headers: { 'User-Agent': 'myBOT Nekogif (https://github.com/Jalalkhan96/Jalalkhan96)', Accept: 'application/json' },
  });
  const item = data?.results?.[0];
  if (!item?.url) throw new Error(`No GIF found for ${safeCategory}`);
  return item;
}

async function ownerAllowed(senderId, sock, from, context) {
  if (context?.isOwner) return true;
  try { return Boolean(await isOwner(senderId, sock, from)); } catch { return false; }
}

async function sendList(sock, msg, from) {
  const endpoints = await getEndpoints();
  const list = endpoints.map((ep, i) => `${String(i + 1).padStart(2, '0')}. ${ep}`).join('\n');
  return sock.sendMessage(from, {
    text: `🐾 *NEKOGIF CATEGORIES*\n\n${list}\n\nUse:\n${prefix()}nekogif <category>\n${prefix()}nekogif random\n${prefix()}nekogif sticker <category>`,
  }, { quoted: msg });
}

async function sendPlayableGif(sock, msg, from, item, category) {
  const fetched = await fetchBuffer(item.url);
  const detected = fetched.type?.ext || (fetched.contentType.includes('gif') ? 'gif' : fetched.contentType.includes('webm') ? 'webm' : 'mp4');
  try {
    const mp4 = await toPlayableMp4(fetched.buffer, detected);
    return sock.sendMessage(from, {
      video: mp4,
      mimetype: 'video/mp4',
      fileName: `nekogif-${category || 'random'}.mp4`,
      gifPlayback: false,
      caption: `🐾 *NEKOGIF*\n🏷️ Category: *${category || 'random'}*`,
    }, { quoted: msg });
  } catch (error) {
    if (detected === 'gif') {
      console.warn(`[NEKOGIF] FFmpeg unavailable/failed, sending original GIF as WhatsApp GIF: ${error?.message || error}`);
      return sock.sendMessage(from, {
        video: fetched.buffer,
        mimetype: 'image/gif',
        fileName: `nekogif-${category || 'random'}.gif`,
        gifPlayback: true,
        caption: `🐾 *NEKOGIF*\n🏷️ Category: *${category || 'random'}*`,
      }, { quoted: msg });
    }
    throw error;
  }
}

async function sendSticker(sock, msg, from, item, category) {
  const fetched = await fetchBuffer(item.url);
  const sticker = await animatedWebpFromBuffer(fetched.buffer, { maxDuration: MAX_DURATION });
  if (!Buffer.isBuffer(sticker) || sticker.length < 100) throw new Error('Animated sticker output is invalid');
  return sock.sendMessage(from, { sticker, isAnimated: true }, { quoted: msg });
}

const handlers = [
  {
    command: 'nekogif',
    aliases: ['ng', 'ngif', 'nekovid'],
    category: 'fun',
    description: 'Fetch a playable anime GIF/video or convert it directly to an animated sticker.',
    usage: `${prefix()}nekogif [category|random|sticker <category>|on|off|list]`,
    async handler(sock, msg, args = [], context = {}) {
      const from = context.chatId || msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const requested = args.join(' ').trim().toLowerCase();
      const senderId = context.senderId || msg.key.participant || msg.key.remoteJid;
      const ownerCheck = await ownerAllowed(senderId, sock, from, context);

      if (requested === 'on' || requested === 'enable') {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This setting is for groups only.' }, { quoted: msg });
        if (!ownerCheck) return sock.sendMessage(from, { text: '❌ Only a configured owner can enable Nekogif.' }, { quoted: msg });
        nekoGroups.enableGifGroup(from);
        return sock.sendMessage(from, { text: '✅ Nekogif enabled in this group.' }, { quoted: msg });
      }
      if (requested === 'off' || requested === 'disable') {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This setting is for groups only.' }, { quoted: msg });
        if (!ownerCheck) return sock.sendMessage(from, { text: '❌ Only a configured owner can disable Nekogif.' }, { quoted: msg });
        nekoGroups.disableGifGroup(from);
        return sock.sendMessage(from, { text: '✅ Nekogif disabled in this group.' }, { quoted: msg });
      }
      if (!isGroup || !nekoGroups.isGifGroupEnabled(from)) {
        return sock.sendMessage(from, { text: `❌ Nekogif is disabled here. Owner: ${prefix()}nekogif on` }, { quoted: msg });
      }

      try {
        if (!requested || requested === 'list' || requested === 'help') return sendList(sock, msg, from);
        const parts = requested.split(/\s+/);
        const stickerMode = parts[0] === 'sticker' || parts[0] === 'st'
          || parts[0] === 'tosticker';
        let category = stickerMode ? parts.slice(1).join('_') : parts.join('_');
        if (category === 'random' || category === '') category = await getRandomEndpoint();
        const item = await getGif(category);
        if (stickerMode) return sendSticker(sock, msg, from, item, category);
        return sendPlayableGif(sock, msg, from, item, category);
      } catch (error) {
        console.error('[NEKOGIF] Error:', error);
        return sock.sendMessage(from, { text: `❌ Nekogif failed. ${error?.message || 'Media could not be prepared.'}` }, { quoted: msg });
      }
    },
  },
  {
    command: 'nekogiflist',
    aliases: ['nekogifcats', 'ngiflist'],
    category: 'fun',
    description: 'List available NekosBest GIF categories.',
    usage: `${prefix()}nekogiflist`,
    async handler(sock, msg, args = [], context = {}) {
      const from = context.chatId || msg.key.remoteJid;
      if (!from.endsWith('@g.us') || !nekoGroups.isGifGroupEnabled(from)) {
        return sock.sendMessage(from, { text: `❌ Nekogif is disabled here. Owner: ${prefix()}nekogif on` }, { quoted: msg });
      }
      try { return await sendList(sock, msg, from); }
      catch (error) { return sock.sendMessage(from, { text: `❌ Failed to fetch categories. ${error?.message || ''}` }, { quoted: msg }); }
    },
  },
];

module.exports = handlers;
