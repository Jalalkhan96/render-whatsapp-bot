const { health } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffapihealth',
  aliases: ['ffhealth', 'ffapicheck'],
  category: 'freefire',
  description: 'Check configured Free Fire API availability',
  usage: '.ffapihealth',
  adminOnly: true,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const results = await health();
    const text =
      `╭───「 🩺 *FREE FIRE API HEALTH* 」\n` +
      `╰───────────────○\n\n` +
      results.map(item => `${item.ok ? '✅' : '❌'} ${item.status} • ${item.ms}ms\n${item.endpoint}`).join('\n\n') +
      `\n\n💡 Set FF_INFO_API, FF_BAN_API or FF_SEARCH_API in .env for your own provider.`;
    await sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};
