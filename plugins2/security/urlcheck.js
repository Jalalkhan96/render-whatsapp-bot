const { URL } = require('url');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'urlcheck',
  aliases: ['urlinspect', 'linkcheck'],
  category: 'security',
  description: 'Inspect a URL safely without opening it',
  usage: '.urlcheck <url>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      const input = (args[0] || '').trim();
      if (!input) throw new Error('URL do. Example: .urlcheck https://example.com');
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      const flags = [];
      if (url.protocol !== 'https:') flags.push('⚠️ HTTPS nahi hai');
      if (url.username || url.password) flags.push('⚠️ Login data URL mein hai');
      if (url.hostname.includes('@')) flags.push('⚠️ Suspicious host format');
      await sock.sendMessage(chatId, {
        text: `🔎 *URL CHECK*\n\n🌐 Host: ${url.hostname}\n🔗 Protocol: ${url.protocol.replace(':', '')}\n📁 Path: ${url.pathname || '/'}\n🔢 Query keys: ${[...url.searchParams.keys()].length}\n\n${flags.length ? flags.join('\n') : '✅ Basic URL structure looks normal.'}\n\n💡 Ye command URL open nahi karti.`,
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ URL samajh nahi aaya: ${error.message}`, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
    }
  }
};
