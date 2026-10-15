const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffapis',
  aliases: ['fffreeapi', 'ffapilist'],
  category: 'freefire',
  description: 'Lists free Free Fire APIs used by this bot (Admin only)',
  usage: '.ffapis',
  adminOnly: true,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = `🌐 *FREE FIRE FREE APIS*\n\n*🔑 INFO (player stats)*\n1. developers.freefirecommunity.com/api/v1/info\n2. freefireinfo-zy9l.onrender.com/api/v1/player-info\n3. free-ff-api-src-5plp.onrender.com/api/v1/account\n4. raw.thug4ff.xyz/info\n\n*🔎 SEARCH*\n- freefireinfo-zy9l.onrender.com/api/v1/search-players\n\n*🚫 BAN CHECK*\n- developers.freefirecommunity.com/api/v1/bancheck\n- freefireapi.me/api/ban\n\n*📦 ITEMS*\n- github.com/iamaanahmad/FreeFireItems (ItemData.json)\n\n_Setup: .env mein \`FF_API_KEY\` (community API key) aur \`FF_INFO_API\` set kar sakte hain._\n\n✨ *Powered by ABIX-AE*`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};