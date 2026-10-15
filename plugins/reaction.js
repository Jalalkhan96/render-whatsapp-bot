const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const settings = require('../settings');

const execFileAsync = promisify(execFile);
const API = 'https://nekos.best/api/v2';
const USER_AGENT = `${settings.botName || 'ABIX'} WhatsApp Bot`;
const tempDir = path.join(__dirname, '../temp/reactions');
const categoryCache = { at: 0, values: [] };
const CACHE_MS = 10 * 60 * 1000;

const reactionAliases = [
  'reactionlist', 'rlist', 'kiss', 'hug', 'slap', 'pat', 'peck', 'poke', 'cuddle', 'blush', 'wink', 'wave', 'dance', 'cry', 'happy', 'angry', 'baka', 'bite', 'bleh', 'blowkiss', 'bonk', 'bored', 'carry', 'clap', 'confused', 'facepalm', 'feed', 'handhold', 'handshake', 'highfive', 'kabedon', 'kick', 'lappillow', 'laugh', 'lurk', 'nod', 'nom', 'nope', 'nya', 'pout', 'punch', 'run', 'salute', 'shake', 'shoot', 'shocked', 'shrug', 'sip', 'sleep', 'smile', 'smug', 'spin', 'stare', 'tableflip', 'teehee', 'think', 'thumbsup', 'tickle', 'wag', 'yawn', 'yeet', 'awoo', 'cringe', 'glomp'
]

function ensureTempDir() {
  fs.mkdirSync(tempDir, { recursive: true });
}

function cleanup(filePath, delay = 15000) {
  setTimeout(() => {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }, delay).unref?.();
}

async function getCategories() {
  if (Date.now() - categoryCache.at < CACHE_MS && categoryCache.values.length) {
    return categoryCache.values;
  }
  const response = await axios.get(`${API}/endpoints`, {
    timeout: 30000,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  const data = response.data || {};
  const categories = Object.entries(data)
    .filter(([, value]) => value && value.format === 'gif')
    .map(([name]) => name)
    .sort();
  categoryCache.at = Date.now();
  categoryCache.values = categories;
  return categories;
}

async function getGif(category) {
  const response = await axios.get(`${API}/${encodeURIComponent(category)}`, {
    timeout: 30000,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  const results = response.data?.results;
  if (!Array.isArray(results) || !results.length) throw new Error(`No GIF found for ${category}`);
  const item = results[Math.floor(Math.random() * results.length)];
  if (!item?.url) throw new Error('GIF URL missing.');
  return item;
}

async function downloadFile(url, output) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer', timeout: 60000,
    headers: { 'User-Agent': USER_AGENT },
  });
  fs.writeFileSync(output, Buffer.from(response.data));
}

async function gifToSticker(input, output) {
  await execFileAsync('ffmpeg', [
    '-y','-hide_banner','-loglevel','error','-i',input,
    '-vf','scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0',
    '-c:v','libwebp','-lossless','0','-q:v','70','-loop','0','-an',output,
  ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
}

function findTag(categories, input) {
  const value = String(input || '').trim().toLowerCase();
  return categories.find(name => String(name).toLowerCase() === value) || null;
}

module.exports = {
  command: 'reaction',
  aliases: ['react', ...reactionAliases],
  category: 'anime',
  description: 'Anime reaction animated stickers',
  usage: `${settings.prefixes[0] || '.'}reaction | ${settings.prefixes[0] || '.'}kiss | ${settings.prefixes[0] || '.'}cry`,

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const raw = String(
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      ''
    ).trim();
    const command = raw.split(/\s+/)[0].replace(/^[.$!#]/, '').toLowerCase();

    try {
      const categories = await getCategories();

      if (command === 'reactionlist' || command === 'rlist') {
        const text = [
          '╭━━━「 🎭 REACTION LIST 」━━━╮',
          '',
          '🎬 *Available GIF actions*',
          ...categories.map((name, i) => `${String(i + 1).padStart(2,'0')}. ${name}`),
          '',
          '💡 Example:',
          `${settings.prefixes[0] || '.'}kiss`,
          `${settings.prefixes[0] || '.'}cry`,
          `${settings.prefixes[0] || '.'}reaction`,
          '',
          `📊 Total: *${categories.length}*`,
          '╰━━━━━━━━━━━━━━━━━━━━━━╯',
        ].join('\n');
        return sock.sendMessage(chatId, { text }, { quoted: message });
      }

      let category;
      const requested = String(args[0] || '').trim();
      if (command === 'reaction' || command === 'react') {
        category = requested || categories[Math.floor(Math.random() * categories.length)];
      } else {
        category = command;
      }

      const actual = findTag(categories, category);
      if (!actual) {
        return sock.sendMessage(chatId, {
          text: `❌ *Unknown reaction:* ${category}\n\nUse ${settings.prefixes[0] || '.'}reactionlist to see valid actions.`,
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, { react: { text: '🎬', key: message.key } }).catch(() => {});
      const gif = await getGif(actual);
      ensureTempDir();
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const gifPath = path.join(tempDir, `${id}.gif`);
      const webpPath = path.join(tempDir, `${id}.webp`);
      await downloadFile(gif.url, gifPath);
      await gifToSticker(gifPath, webpPath);
      if (!fs.existsSync(webpPath) || fs.statSync(webpPath).size <= 0) throw new Error('Sticker conversion failed.');

      await sock.sendMessage(chatId, {
        sticker: { url: webpPath },
      }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});
      cleanup(gifPath);
      cleanup(webpPath);
    } catch (error) {
      console.error('[REACTION] Error:', error);
      await sock.sendMessage(chatId, {
        text: `❌ Reaction *${command || 'random'}* failed. Please try again.`,
      }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
    }
  },
};
