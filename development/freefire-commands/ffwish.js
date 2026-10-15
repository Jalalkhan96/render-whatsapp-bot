const { getChannelInfo } = require('../../lib/channelInfo');
const store = require('../../lib/ffStore');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffwish',
  aliases: ['ffwishadd'],
  category: 'freefire',
  description: 'Add an item to your Free Fire wishlist',
  usage: '.ffwish <item name>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const item = args.join(' ').trim();
    if (!item) {
      return sock.sendMessage(chatId, { text: '❌ Item name dein. Example: .ffwish Cobra Bundle' }, { quoted: message });
    }
    try {
      const result = store.addWish(userId, item);
      if (result.reason === 'already') {
        return sock.sendMessage(chatId, { text: `⚠️ *${item}* already in your wishlist!`, ...FAKE_FORWARD }, { quoted: message });
      }
      const text = `✅ *ADDED TO WISHLIST*\n\n📦 *${item}*\n\n📋 Total items: \`${result.total}/25\``;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `📋 *FF Wish* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};