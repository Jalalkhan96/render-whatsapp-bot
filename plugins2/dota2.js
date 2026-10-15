const axios = require('axios');

module.exports = {
  command: 'dota2',
  aliases: ['dota2api'],
  category: 'esports',
  description: 'ABIX-AE Auto Generated Plugin - dota2',
  usage: '.dota2',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://api.opendota.com/api/proMatches`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data[0] ? "🎮 DOTA 2 Pro Match\nLeague: " + res.data[0].league_name + "\n" + res.data[0].radiant_name + " vs " + res.data[0].dire_name + "\nWinner: " + (res.data[0].radiant_win ? res.data[0].radiant_name : res.data[0].dire_name) : "No match found";

      const finalTxt = `╭───「 🏆 *DOTA2* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('dota2 error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
