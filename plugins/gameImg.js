'use strict';

const axios = require('axios');

module.exports = {
  command: 'gameimg',
  aliases: ['gamingimage', 'randomgameimage'],
  category: 'images',
  description: 'Get a random gaming image',
  usage: '.gameimg',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      const res = await axios.get(
        'https://raw.githubusercontent.com/GlobalTechInfo/Database/main/images/game.json',
        { timeout: 10000 }
      );

      const list = Array.isArray(res.data) ? res.data.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)) : [];
      if (!list.length) {
        return await sock.sendMessage(chatId, {
          text: '❌ No gaming image was available right now. Use *-game* for the chat Game Arcade.'
        }, { quoted: message });
      }

      const randomImage = list[Math.floor(Math.random() * list.length)];
      return await sock.sendMessage(chatId, {
        image: { url: randomImage },
        caption: '🎮 Gaming Image'
      }, { quoted: message });
    } catch (err) {
      console.error('Game image plugin error:', err.message);
      return await sock.sendMessage(chatId, {
        text: '❌ Gaming image service is unavailable right now.\n\nUse *-game* to open the playable WhatsApp Game Arcade.'
      }, { quoted: message });
    }
  }
};
