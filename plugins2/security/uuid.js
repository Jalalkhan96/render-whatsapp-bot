const crypto = require('crypto');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'uuid',
  aliases: ['uuidgen', 'guid'],
  category: 'security',
  description: 'Generate a random UUID',
  usage: '.uuid',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, { text: `🆔 *UUID v4*\n\n\`${crypto.randomUUID()}\`\n\n🔐 Locally generated with Node crypto.`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
