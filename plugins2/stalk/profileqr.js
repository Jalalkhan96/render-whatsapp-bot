const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { profileUrl } = require('../../lib/stalkTools');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'profileqr', aliases: ['socialqr'], category: 'stalk', description: 'Create a QR for a public profile URL', usage: '.profileqr <platform> <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const user = (args[1] || '').replace(/^@/, ''); const url = profileUrl(args[0], user);
    if (!url || !/^[a-zA-Z0-9._-]{2,50}$/.test(user)) return sock.sendMessage(chatId, { text: '⚡ Format: .profileqr github username', ...FAKE_FORWARD }, { quoted: message });
    try {
      const qr = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=500`;
      const response = await axios.get(qr, { responseType: 'arraybuffer', timeout: 12000 });
      return sock.sendMessage(chatId, { image: Buffer.from(response.data), caption: `📱 *PROFILE QR*\n${url}\n\n⚠️ Public/unverified link.`, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) { return sock.sendMessage(chatId, { text: `❌ QR service unavailable: ${error.message}`, ...FAKE_FORWARD }, { quoted: message }); }
  }
};
