const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'handlecheck',
  aliases: ['usernamecheck', 'handle'],
  category: 'stalk',
  description: 'Check username format locally',
  usage: '.handlecheck <username>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const raw = (args[0] || '').trim();
    const username = raw.replace(/^@/, '');
    const valid = /^[a-zA-Z0-9._-]{2,50}$/.test(username);
    const reserved = /^(admin|administrator|support|official|root|security)$/i.test(username);
    const text = !raw
      ? '⚡ Username do. Example: .handlecheck @jalal'
      : `🧪 *HANDLE CHECK*\n\n` +
        `👤 Handle: \`@${username}\`\n` +
        `${valid ? '✅ Format allowed' : '❌ Format invalid'}\n` +
        `${reserved ? '⚠️ Common/reserved-looking name' : '✅ No obvious reserved word'}\n\n` +
        `💡 Ye command kisi platform par username ki availability check nahi karti.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
