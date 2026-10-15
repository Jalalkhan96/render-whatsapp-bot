const axios = require('axios');

module.exports = {
  command: 'chess',
  aliases: ['chessapi'],
  category: 'esports',
  description: 'ABIX-AE Auto Generated Plugin - chess',
  usage: '.chess',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://lichess.org/api/tv`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = "♟️ Live Chess (Lichess TV)\nWhite: " + res.data.white.name + " (" + res.data.white.rating + ")\nBlack: " + res.data.black.name + " (" + res.data.black.rating + ")" ;

      const finalTxt = `╭───「 🏆 *CHESS* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('chess error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
