const net = require('net');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ipcheck',
  aliases: ['ipvalidate', 'checkip'],
  category: 'security',
  description: 'Validate an IP address locally',
  usage: '.ipcheck <ip>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const ip = (args[0] || '').trim();
    const version = net.isIP(ip);
    const text = version
      ? `🌐 *IP CHECK*\n\n✅ Valid IPv${version}: \`${ip}\`\n\n💡 Is command ne IP ko locate ya scan nahi kiya.`
      : '❌ Valid IPv4/IPv6 do. Example: .ipcheck 8.8.8.8';
    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
