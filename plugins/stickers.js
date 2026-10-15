const axios = require('axios');
const {
  animatedMediaToWebp,
  addStickerExifBuffer,
} = require('../lib/sticker');

const recentByQuery = new Map();
const RECENT_LIMIT = 5;

function rememberAndPick(query, urls) {
  const recent = recentByQuery.get(query) || [];
  const valid = urls.filter(url => url && !recent.includes(url));
  const pool = valid.length ? valid : urls;
  if (!pool.length) return null;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  recentByQuery.set(query, [selected, ...recent.filter(url => url !== selected)].slice(0, RECENT_LIMIT));
  return selected;
}

async function validMediaUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'ABIX-AE Sticker Search' },
    });
    const type = String(response.headers['content-type'] || '').toLowerCase();
    response.data.destroy();
    return !type.includes('text/html') && (type.includes('video/') || type.includes('image/') || type.includes('gif'));
  } catch {
    return false;
  }
}

module.exports = {
  command: 'stickers',
  aliases: ['stickersearch', 'ssticker'],
  category: 'stickers',
  description: 'Search for a real sticker/GIF result and send it as a sticker',
  usage: '.stickers <search term>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args?.join(' ')?.trim();
    if (!query) return sock.sendMessage(chatId, { text: '*Provide a search term.*\nExample: .stickers funny' }, { quoted: message });

    try {
      await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });
      const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
      const { data } = await axios.get('https://api.giphy.com/v1/gifs/search', {
        params: { api_key: apiKey, q: query, limit: 12, rating: 'pg-13' },
        timeout: 15000,
      });
      const candidates = [...new Set((data?.data || [])
        .map(item => item?.images?.original?.url || item?.images?.fixed_height?.url)
        .filter(Boolean))];

      const valid = [];
      for (const url of candidates) {
        if (await validMediaUrl(url)) valid.push(url);
        if (valid.length >= 8) break;
      }
      const selected = rememberAndPick(query.toLowerCase(), valid);
      if (!selected) throw new Error('No valid media result is available right now.');

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      const response = await axios.get(selected, { responseType: 'arraybuffer', timeout: 30000, maxRedirects: 5 });
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('text/html')) throw new Error('Search result was an HTML page, not media.');

      const sticker = await animatedMediaToWebp(Buffer.from(response.data), { maxDuration: 6, maxBytes: 950 * 1024 });
      const finalSticker = await addStickerExifBuffer(sticker, `ABIX-AE Search: ${query}`, 'Bot', ['🎭']);
      await sock.sendMessage(chatId, { sticker: finalSticker }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
      console.error('[stickers]', error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(chatId, { text: `❌ Failed to fetch a valid sticker result.\n\n${error.message || 'Try another search.'}` }, { quoted: message });
    }
  },
};
