const { getChannelInfo } = require('../../lib/channelInfo');
const store = require('../../lib/ffStore');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffunwish',
  aliases: ['ffwishremove', 'ffrmwish'],
  category: 'freefire',
  description: 'Remove an item from your Free Fire wishlist',
  usage: '.ffunwish <item name or number>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const item = args.join(' ').trim();
    if (!item) {
      return sock.sendMessage(chatId, { text: '❌ Item name ya number dein. Example: .ffunwish 1' }, { quoted: message });
    }
    try {
      const result = store.removeWish(userId, item);
      if (!result.removed) {
        return sock.sendMessage(chatId, { text: `📋 *FF Unwish* → ${funnyError('no results')}`, ...FAKE_FORWARD }, { quoted: message });
      }
      const text = `✅ *REMOVED FROM WISHLIST*\n\n📦 *${result.item}*\n\n📋 Total items: \`${result.total}/25\``;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `📋 *FF Unwish* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};