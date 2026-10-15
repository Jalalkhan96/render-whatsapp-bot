const { getChannelInfo } = require('../../lib/channelInfo');
const { validateUid } = require('../../lib/freefire');
const store = require('../../lib/ffStore');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'fflink',
  aliases: ['fflinkuid', 'linkff'],
  category: 'freefire',
  description: 'Link your Free Fire UID to this bot account',
  usage: '.fflink <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const userId = context.senderId || message.key.participant || message.key.remoteJid;
    const uid = String(args[0] || '').trim();
    if (!validateUid(uid)) {
      return sock.sendMessage(chatId, { text: '❌ Valid UID dein (6-15 digits). Example: .fflink 123456789' }, { quoted: message });
    }
    store.linkUid(userId, uid);
    const text = `🔗 *FF ACCOUNT LINKED*\n\n👤 UID: \`${uid}\`\n✅ Ab aap \`.ffme\`, \`.ffinfo\` aur \`.ffwishlist\` use kar sakte hain!`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};