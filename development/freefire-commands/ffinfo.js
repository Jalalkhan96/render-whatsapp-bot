const { fetchInfo, profileText } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffinfo',
  aliases: ['ff', 'ffprofile', 'profileff'],
  category: 'freefire',
  description: 'Show a Free Fire player profile by UID',
  usage: '.ffinfo <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const uid = args[0];
    if (!uid) return sock.sendMessage(chatId, { text: '❌ UID dein. Example: .ffinfo 123456789' }, { quoted: message });
    try {
      await sock.sendMessage(chatId, { react: { text: '🔥', key: message.key } });
      const data = await fetchInfo(uid);
      return sock.sendMessage(chatId, { text: profileText(data), ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `🔥 *FF Info* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};