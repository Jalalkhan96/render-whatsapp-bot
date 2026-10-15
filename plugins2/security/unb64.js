const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'unb64',
  aliases: ['ubase64', 'dec64', 'deb64'],
  category: 'security',
  description: 'Base64 decode a text',
  usage: '.unb64 <base64>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter base64 text to decode.\nExample: .unb64 SGVsbG8=',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
    try {
      const dec = Buffer.from(text, 'base64').toString('utf8');
      if (!dec || /[\uFFFD]/.test(dec)) throw new Error('bad b64');
      await sock.sendMessage(chatId, {
        text: `🔓 *Base64 Decode*\n\n\`${dec}\`\n\n💡 Encode: .b64 ${dec.slice(0, 20)}...`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    } catch (err) {
      await sock.sendMessage(chatId, { text: funnyError(err), contextInfo: FAKE_FORWARD }, { quoted: message });
    }
  }
};