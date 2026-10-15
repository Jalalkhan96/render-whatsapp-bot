const axios = require('axios');

module.exports = {
  command: 'meowfact',
  aliases: ['meowfactapi'],
  category: 'fun',
  description: 'ABIX-AE Auto Generated Plugin - meowfact',
  usage: '.meowfact',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://meowfacts.herokuapp.com/`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data.data[0];

      const finalTxt = `╭───「 🌐 *MEOWFACT* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('meowfact error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
