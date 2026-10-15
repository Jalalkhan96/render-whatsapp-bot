const crypto = require('crypto');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'randomhex',
  aliases: ['hexgen', 'tokenhex'],
  category: 'security',
  description: 'Generate cryptographically random hex',
  usage: '.randomhex [bytes]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const bytes = Math.min(64, Math.max(4, Number.parseInt(args[0], 10) || 16));
    const value = crypto.randomBytes(bytes).toString('hex');
    await sock.sendMessage(chatId, { text: `🎲 *RANDOM HEX*\n\n\`${value}\`\n\n📏 ${bytes} secure random bytes`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
