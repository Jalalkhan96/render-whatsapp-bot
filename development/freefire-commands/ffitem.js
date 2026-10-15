const { fetchItems, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffitem',
  aliases: ['ffitems', 'itemff'],
  category: 'freefire',
  description: 'Search Free Fire items from a community database',
  usage: '.ffitem <name or id>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args.join(' ').trim().toLowerCase();
    if (!query) return sock.sendMessage(chatId, { text: '❌ Item name ya ID dein. Example: .ffitem Sakura' }, { quoted: message });
    try {
      await sock.sendMessage(chatId, { react: { text: '📦', key: message.key } });
      const items = await fetchItems();
      const matches = items.filter(item => JSON.stringify(item).toLowerCase().includes(query)).slice(0, 8);
      if (!matches.length) return sock.sendMessage(chatId, { text: `📦 *FF Items* → ${funnyError('no results')}`, ...FAKE_FORWARD }, { quoted: message });
      const text = `📦 *FREE FIRE ITEMS*\n\n${matches.map((item, index) => `${index + 1}. *${field(item.itemName || item.name, 'Unknown')}*\n   🆔 ${field(item.itemID || item.id)} | ${field(item.itemType || item.type, 'Misc')}`).join('\n\n')}`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `📦 *FF Items* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};