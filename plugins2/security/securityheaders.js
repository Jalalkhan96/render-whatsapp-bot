const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'securityheaders',
  aliases: ['headerhelp', 'headershelp'],
  category: 'security',
  description: 'Explain important HTTP security headers',
  usage: '.securityheaders',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = `🧱 *SECURITY HEADERS GUIDE*\n\n` +
      `• HSTS — HTTPS enforce karta hai\n` +
      `• CSP — allowed scripts/resources control karta hai\n` +
      `• X-Content-Type-Options — MIME sniffing rokta hai\n` +
      `• X-Frame-Options — clickjacking risk kam karta hai\n` +
      `• Referrer-Policy — referrer data limit karta hai\n\n` +
      `🔍 Live check: .headers <url>\n⚠️ Advice general hai; production config test zaroor karein.`;
    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
