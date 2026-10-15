const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { animatedWebpFromBuffer } = require('../lib/sticker');

const recentByQuery = new Map();
const CACHE_LIMIT = 6;

function keyOf(query) {
  return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function remember(query, id) {
  const key = keyOf(query);
  const list = recentByQuery.get(key) || [];
  recentByQuery.set(key, [id, ...list.filter((x) => x !== id)].slice(0, CACHE_LIMIT));
}

module.exports = {
  command: 'gifsearch',
  aliases: ['findgif'],
  category: 'media',
  description: 'Search for a GIF and send it as an animated sticker',
  usage: '.gifsearch <keyword>',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      return await sock.sendMessage(chatId, {
        text: '⚠️ Please enter a keyword to search!\nExample: .gifsearch cat'
      }, { quoted: message });
    }

    try {
      await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

      const apiKey = 'dc6zaTOxFJmzC';
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`
      );
      if (!res.ok) throw new Error(`Giphy HTTP ${res.status}`);
      const data = await res.json();

      const results = (data?.data || []).filter((item) =>
        item?.id && item?.images?.original?.url
      );

      if (!results.length) {
        return await sock.sendMessage(chatId, {
          text: `❌ No GIFs found for "${query}"`
        }, { quoted: message });
      }

      const used = new Set(recentByQuery.get(keyOf(query)) || []);
      let candidates = results.filter((item) => !used.has(item.id));
      if (!candidates.length) {
        recentByQuery.delete(keyOf(query));
        candidates = results;
      }

      candidates = candidates.slice().sort(() => Math.random() - 0.5);
      let selected = null;

      for (const item of candidates) {
        const url = item.images?.original?.url;
        try {
          const check = await fetch(url, { method: 'HEAD' });
          if (!check.ok) continue;
          selected = item;
          break;
        } catch {}
      }

      if (!selected) {
        selected = candidates[0];
      }

      remember(query, selected.id);
      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const imgRes = await fetch(selected.images.original.url);
      if (!imgRes.ok) throw new Error(`GIF download HTTP ${imgRes.status}`);
      const imgBuffer = await imgRes.buffer();
      if (!imgBuffer.length) throw new Error('GIF download was empty');

      const webpBuffer = await animatedWebpFromBuffer(imgBuffer, { maxDuration: 6 });
      await sock.sendMessage(chatId, { sticker: webpBuffer, isAnimated: true }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (e) {
      console.error('gifsearch error:', e);
      await sock.sendMessage(chatId, {
        text: '❌ Failed to search and convert GIF.'
      }, { quoted: message });
      try { await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }); } catch {}
    }
  }
};
