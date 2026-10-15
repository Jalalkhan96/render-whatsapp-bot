const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'secretmask',
  aliases: ['masksecret', 'redact'],
  category: 'security',
  description: 'Mask a secret before sharing logs',
  usage: '.secretmask <text>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const value = args.join(' ').trim();
    if (!value) return sock.sendMessage(chatId, { text: '⚡ Secret/text do. Example: .secretmask my-api-key-123', contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
    const visible = Math.min(3, Math.floor(value.length / 4));
    const masked = value.slice(0, visible) + '•'.repeat(Math.max(3, value.length - visible * 2)) + value.slice(-visible);
    await sock.sendMessage(chatId, { text: `🕶️ *SECRET MASK*\n\nOriginal ko share mat karo:\n\`${masked}\`\n\n✅ Logs/screenshots mein masked value use karo.`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
