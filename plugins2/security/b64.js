const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'b64',
  aliases: ['base64', 'enc64'],
  category: 'security',
  description: 'Base64 encode a text',
  usage: '.b64 <text>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter text to encode.\nExample: .b64 Hello World',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
    const enc = Buffer.from(text, 'utf8').toString('base64');
    await sock.sendMessage(chatId, {
      text: `🔐 *Base64 Encode*\n\n\`${enc}\`\n\n💡 Decode: .unb64 ${enc.slice(0, 20)}...`,
      contextInfo: FAKE_FORWARD
    }, { quoted: message });
  }
};