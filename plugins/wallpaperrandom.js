const axios = require('axios');
const { getChannelInfo } = require('../lib/channelInfo');
const { funnyError } = require('../lib/funny');

const FAKE_FORWARD = getChannelInfo();

const CATS = ['nature', 'anime', 'cars', 'space', 'city', 'abstract', 'animals', 'beach', 'mountains', 'flowers', 'gaming', 'dark', 'minimal', 'architecture', 'art', 'technology', 'forest', 'sunset', 'ocean', 'fantasy', 'sports', 'food', 'travel', 'winter'];

async function download(url) {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 25 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' } });
  if (!(r.headers['content-type'] || '').startsWith('image/')) throw new Error('not image');
  return Buffer.from(r.data);
}

module.exports = {
  command: 'wpr',
  aliases: ['wallrandom', 'randwallpaper', 'randomwp'],
  category: 'utility',
  description: 'Random 4K wallpaper — random category har baar',
  usage: '.wpr [category]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const cat = (args[0] || '').trim().toLowerCase();
    const allCats = [cat || CATS[Math.floor(Math.random() * CATS.length)], CATS[Math.floor(Math.random() * CATS.length)], 'wallpaper'];

    await sock.sendMessage(chatId, { react: { text: '🖼️', key: message.key } });

    for (const c of allCats) {
      try {
        const url = `https://loremflickr.com/2560/1440/${encodeURIComponent(c)}?lock=${Math.floor(Math.random() * 99999)}`;
        const buf = await download(url);
        const caption =
          `╭───「 🖼️ *RANDOM 4K WALLPAPER* 」\n` +
          `│\n` +
          `│ 🎨 *Category:* ${c}\n` +
          `│ 📐 *Resolution:* 2560x1440\n` +
          `│\n` +
          `│ 💡 .wp <name> — search karo\n` +
          `│ 💡 .wpr — ek aur random\n` +
          `╰───「 ✨ ABIX-AE 」`;
        await sock.sendMessage(chatId, { image: buf, caption, contextInfo: FAKE_FORWARD }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        return;
      } catch (e) { console.error('[WPR]', c, e.message); }
    }

    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(chatId, { text: funnyError(new Error('wallpaper')), contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};