const axios = require('axios');

module.exports = {
  command: 'nba',
  aliases: ['nbaapi'],
  category: 'sports',
  description: 'ABIX-AE Auto Generated Plugin - nba',
  usage: '.nba',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data.events && res.data.events[0] ? "🏀 Match: " + res.data.events[0].name + "\nStatus: " + res.data.events[0].status.type.detail : "Koi NBA match nahi chal raha!";

      const finalTxt = `╭───「 🏆 *NBA* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('nba error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
