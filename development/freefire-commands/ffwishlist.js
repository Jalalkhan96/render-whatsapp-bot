const { getChannelInfo } = require('../../lib/channelInfo');
const store = require('../../lib/ffStore');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffwishlist',
  aliases: ['ffwishes', 'ffwishlistview'],
  category: 'freefire',
  description: 'View your saved Free Fire wishlist items',
  usage: '.ffwishlist',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const list = store.getWishlist(userId);
    if (!list.length) {
      return sock.sendMessage(chatId, { text: '📋 Your wishlist is empty! Use `.ffwish <item>` to add things.', ...FAKE_FORWARD }, { quoted: message });
    }
    const items = list.map((item, index) => `\`${String(index + 1).padStart(2, '0')}\` ─ ${item}`).join('\n');
    const text = `📋 *YOUR FF WISHLIST*\n\n${items}\n\n_Remove with \`.ffunwish <number>\`_\n_Total: ${list.length}/25 items_`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};