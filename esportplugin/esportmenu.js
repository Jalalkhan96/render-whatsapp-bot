const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const ABIX = settings.botName || 'myBOT';

module.exports = {
  command: 'esportmenu',
  aliases: ['esportmenu2', 'esports', 'esportplugin', 'esport'],
  category: 'esports',
  description: 'Shows sports and esports commands',
  usage: '.esportmenu',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    const text = `╭━━━〔 🎮 *ESPORTS PLUGIN* 〕━━━╮
┃ Sports Gaming Menu
┃ Sports and esports ╰━━━━━━━━━━━━━━━━━━━━━╯

*🏆 SPORTS/ESPORTS COMMANDS*
⚡ ${prefix}allsports - All sports list
⚡ ${prefix}team - Search sports team
⚡ ${prefix}player - Search player stats
⚡ ${prefix}football - Football data
⚡ ${prefix}cricket - Cricket score
⚡ ${prefix}cricket-live - Live cricket
⚡ ${prefix}f1 - Formula 1
⚡ ${prefix}nba - NBA stats
⚡ ${prefix}nfl - NFL stats
⚡ ${prefix}dota2 - Dota 2 pro tracker
⚡ ${prefix}chess - Chess player stats

✨ *Powered by ${ABIX}*`;

    try {
      const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
      const contextInfo = {};
      const options = fs.existsSync(imagePath)
        ? { image: fs.readFileSync(imagePath), caption: text, contextInfo }
        : { text, contextInfo };
      return sock.sendMessage(chatId, options, { quoted: message });
    } catch (error) {
      console.error('EsportMenu Error:', error);
      return sock.sendMessage(chatId, { text, contextInfo: {} }, { quoted: message });
    }
  }
};