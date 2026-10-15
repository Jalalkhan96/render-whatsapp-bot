const { getChannelInfo } = require('../../lib/channelInfo');
const { PLATFORMS, username } = require('../../lib/stalkTools');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'handlelinks', aliases: ['platformlinks'], category: 'stalk', description: 'Create links for all supported platforms', usage: '.handlelinks <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const value = username(args[0]);
    if (!value) return sock.sendMessage(chatId, { text: '⚡ Username do. Example: .handlelinks jalal', ...FAKE_FORWARD }, { quoted: message });
    const unique = [...new Map(Object.values(PLATFORMS).map(([name, base]) => [name, [name, base]])).values()];
    const text = `🔗 *PUBLIC HANDLE LINKS*\n\n${unique.map(([name, base]) => `• ${name}: ${base}${encodeURIComponent(value)}`).join('\n')}\n\n⚠️ Links constructed hain; profiles unverified hain.`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};
