const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'emailcheck',
  aliases: ['emailvalidate', 'mailcheck'],
  category: 'security',
  description: 'Validate email format locally',
  usage: '.emailcheck <email>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const email = (args[0] || '').trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
    const text = valid
      ? `📧 *EMAIL CHECK*\n\n✅ Format valid: \`${email}\`\n\n⚠️ Ye sirf format check hai; inbox ya ownership verify nahi hui.`
      : '❌ Email format valid nahi. Example: .emailcheck name@example.com';
    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
