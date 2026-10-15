const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'securitytips',
  aliases: ['securitycheck', 'cybertips', 'seccheck'],
  category: 'security',
  description: 'Practical defensive security checklist',
  usage: '.securitytips',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text =
      `╭───「 🛡️ *SECURITY CHECK* 」\n` +
      `╰───────────────○\n\n` +
      `✅ *Account Safety*\n` +
      `└ 2-step verification on karo\n` +
      `└ Har service ka unique password rakho\n` +
      `└ Login codes kisi ko forward na karo\n\n` +
      `🌐 *Link Safety*\n` +
      `└ Unknown links par login details mat do\n` +
      `└ Domain spelling aur HTTPS check karo\n` +
      `└ Suspicious files ko download na karo\n\n` +
      `📱 *Device Safety*\n` +
      `└ Apps sirf trusted stores se install karo\n` +
      `└ OS aur apps updated rakho\n` +
      `└ Public Wi-Fi par sensitive login avoid karo\n\n` +
      `🔧 Tools: .passgen  •  .passcheck  •  .headers <url>\n` +
      `🔒 Ye checklist defensive aur legal use ke liye hai.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};
