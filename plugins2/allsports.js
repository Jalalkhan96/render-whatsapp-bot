const axios = require('axios');

module.exports = {
  command: 'allsports',
  aliases: ['allsportsapi'],
  category: 'sports',
  description: 'ABIX-AE Auto Generated Plugin - allsports',
  usage: '.allsports',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/all_sports.php`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = "Available Sports: " + res.data.sports.slice(0, 10).map(s => s.strSport).join(", ") + " and many more...";

      const finalTxt = `╭───「 🏆 *ALLSPORTS* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('allsports error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
