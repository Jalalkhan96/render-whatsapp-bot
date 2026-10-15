const axios = require('axios');

module.exports = {
  command: 'bored',
  aliases: ['boredapi'],
  category: 'fun',
  description: 'ABIX-AE Auto Generated Plugin - bored',
  usage: '.bored',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://www.boredapi.com/api/activity`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data.activity;

      const finalTxt = `╭───「 🌐 *BORED* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('bored error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
