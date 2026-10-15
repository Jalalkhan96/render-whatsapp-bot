const { getChannelInfo } = require('../lib/channelInfo');

const MENU_TEXT = `╭━━━〔 🎭 *ANIME REACTIONS* 〕━━━╮
┃
┃  🎬 *REACTION COMMANDS*
┃  ├─ ⚡ *.reaction*
┃  │  Random animated reaction sticker
┃  ├─ 📋 *.reactionlist*
┃  │  All available reaction categories
┃  │
┃  🎭 *DIRECT ACTIONS*
┃  ├─ 💋 *.kiss*  |  🤗 *.hug*
┃  ├─ 👋 *.slap*  |  🫳 *.pat*
┃  └─ 😈 *.bonk*  |  🫂 *.cuddle*
┃
┣━━━━━━━━━━━━━━━━━━━━━━
┃  💡 Kisi command ko directly send karein
┃  Example: *.kiss* ya *.reaction*
┃
╰━━━〔 ✨ *ABIX-AE* 〕━━━╯`;

module.exports = {
  command: 'anmereaction',
  aliases: ['animereactions', 'reactionmenu', 'animeaction'],
  category: 'fun',
  description: 'Anime reaction commands menu',
  usage: '.anmereaction',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, {
      text: MENU_TEXT,
      ...getChannelInfo()
    }, { quoted: message });
  }
};
