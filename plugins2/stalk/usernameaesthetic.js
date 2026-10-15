const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'usernameaesthetic', aliases: ['aestheticuser', 'userstyle'], category: 'stalk', description: 'Generate aesthetic username styles', usage: '.usernameaesthetic <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const value = (args[0] || '').replace(/^@/, '');
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(value)) return sock.sendMessage(chatId, { text: '⚡ Valid username do.', ...FAKE_FORWARD }, { quoted: message });
    const lines = [`✦ ${value} ✦`, `𓆩${value}𓆪`, `『${value}』`, `𝙎𝙤𝙛𝙩 • ${value}`, `ᴀᴇ • ${value}`, `꧁${value}꧂`];
    return sock.sendMessage(chatId, { text: `🎨 *USERNAME AESTHETIC*\n\n${lines.map((x, i) => `${i + 1}. \`${x}\``).join('\n')}`, ...FAKE_FORWARD }, { quoted: message });
  }
};
