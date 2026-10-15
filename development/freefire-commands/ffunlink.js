const { getChannelInfo } = require('../../lib/channelInfo');
const store = require('../../lib/ffStore');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffunlink',
  aliases: ['ffunlinkuid', 'unlinkff'],
  category: 'freefire',
  description: 'Unlink your currently linked Free Fire UID',
  usage: '.ffunlink',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const prev = store.unlinkUid(userId);
    const text = prev
      ? `🔓 *FF ACCOUNT UNLINKED*\n\nUID \`${prev}\` ab linked nahi hai.`
      : 'ℹ️ Koi UID linked nahi tha.';
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};