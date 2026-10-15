const { getChannelInfo } = require('../../lib/channelInfo');
const { fetchInfo, profileText } = require('../../lib/freefire');
const store = require('../../lib/ffStore');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffme',
  aliases: ['ffmyprofile', 'ffmyuid', 'ffprofileme'],
  category: 'freefire',
  description: 'Show your linked Free Fire profile',
  usage: '.ffme',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const uid = store.getLinkedUid(userId);
    if (!uid) {
      return sock.sendMessage(chatId, {
        text: `👤 *FF Me* → ${funnyError('no results')}\n\nPehle \`.fflink <uid>\` use karein!`,
        ...FAKE_FORWARD
      }, { quoted: message });
    }
    try {
      await sock.sendMessage(chatId, { react: { text: '🔥', key: message.key } });
      const data = await fetchInfo(uid);
      return sock.sendMessage(chatId, { text: profileText(data, 'MY FREE FIRE PROFILE'), ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `👤 *FF Me* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};