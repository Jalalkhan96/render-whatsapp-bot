const axios = require('axios');
const { getChannelInfo } = require('../lib/channelInfo');

module.exports = {
  command: 'reactionlist',
  aliases: ['rlist', 'reactions', 'reaction-list'],
  category: 'anime',
  description: 'Show all anime reaction categories',
  usage: '.reactionlist',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      await sock.sendMessage(chatId, { react: { text: '📋', key: message.key } });
      const { data } = await axios.get('https://nekos.best/api/v2/endpoints', {
        timeout: 30000,
        headers: { Accept: 'application/json', 'User-Agent': 'ABIX-AE WhatsApp Bot' }
      });
      const categories = Object.entries(data || {})
        .filter(([, info]) => info?.format === 'gif')
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b));

      if (!categories.length) throw new Error('No GIF categories found');

      const lines = categories.map((name, index) => `${String(index + 1).padStart(2, '0')}. ${name}`);
      const chunks = [];
      let current = `╭━━━「 🎭 REACTION LIST 」━━━╮\n\n🎬 *Anime GIF Reactions*\n\n📊 Total: *${categories.length} categories*\n\n`;
      for (const line of lines) {
        if (current.length + line.length + 1 > 3500) {
          chunks.push(current);
          current = '';
        }
        current += `${line}\n`;
      }
      chunks.push(`${current}\n━━━━━━━━━━━━━━━━━━━━━━\n\n💡 *Use:*\n.reaction <type>\n\n🎲 Random:\n.reaction\n\n╰━━━━━━━━━━━━━━━━━━━━━━╯`);

      for (let index = 0; index < chunks.length; index += 1) {
        const prefix = chunks.length > 1 ? `📄 *REACTION LIST ${index + 1}/${chunks.length}*\n\n` : '';
        await sock.sendMessage(chatId, {
          text: prefix + chunks[index],
          ...getChannelInfo()
        }, { quoted: index === 0 ? message : undefined });
      }
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
      console.error('Reaction list error:', error.message);
      await sock.sendMessage(chatId, {
        text: '❌ Reaction categories fetch nahi ho sakin.',
        ...getChannelInfo()
      }, { quoted: message });
    }
  }
};