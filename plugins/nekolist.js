const axios = require('axios');
const settings = require('../settings');
const nekoGroups = require('../lib/nekoGroups');

module.exports = {
  command: 'nekolist',
  aliases: ['nekohelp', 'waifulist'],
  category: 'fun',
  description: 'List available waifu.im tags',
  usage: '.nekolist',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');
    
    if (!isGroup || !nekoGroups.isGroupEnabled(chatId)) {
        return sock.sendMessage(chatId, { text: '❌ Neko commands are disabled in this chat.\nAdmins can enable them using `-neko on` in a group.' }, { quoted: message });
    }

    try {
      const response = await axios.get('https://api.waifu.im/tags', {
        timeout: 30000,
        headers: { 'Accept-Version': 'v7', Accept: 'application/json' },
      });
      const tags = response.data?.items || [];
      if (!tags.length) throw new Error('No tags returned');
      const list = tags.map((tag, i) => `${String(i + 1).padStart(2, '0')}. ${tag.slug || tag.name}`).join('\n');
      return sock.sendMessage(chatId, {
        text: `🐾 *NEKO TAGS*\n\n${list}\n\nUse ${settings.prefixes[0] || '.'}neko <tag>`,
      }, { quoted: message });
    } catch (error) {
      console.error('[NEKOLIST]', error);
      return sock.sendMessage(chatId, { text: '❌ Could not fetch waifu.im tags.' }, { quoted: message });
    }
  },
};
