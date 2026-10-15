const { getChannelInfo } = require('../../lib/channelInfo');
const store = require('../../lib/ffStore');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffclearwish',
  aliases: ['ffwishclear', 'ffwipeclear'],
  category: 'freefire',
  description: 'Clear your entire Free Fire wishlist',
  usage: '.ffclearwish',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const count = store.clearWishlist(userId);
    const text = count
      ? `🗑️ Cleared *${count}* items from your wishlist.`
      : '📋 Your wishlist is already empty!';
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};