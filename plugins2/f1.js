const axios = require('axios');

module.exports = {
  command: 'f1',
  aliases: ['f1api'],
  category: 'sports',
  description: 'ABIX-AE Auto Generated Plugin - f1',
  usage: '.f1',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://ergast.com/api/f1/current/last/results.json`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data.MRData.RaceTable.Races[0] ? "🏎️ F1 Race: " + res.data.MRData.RaceTable.Races[0].raceName + "\nWinner: " + res.data.MRData.RaceTable.Races[0].Results[0].Driver.givenName + " " + res.data.MRData.RaceTable.Races[0].Results[0].Driver.familyName + " (" + res.data.MRData.RaceTable.Races[0].Results[0].Constructor.name + ")" : "Koi recent race nahi mili!";

      const finalTxt = `╭───「 🏆 *F1* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('f1 error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
