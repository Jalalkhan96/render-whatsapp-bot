const axios = require('axios');

module.exports = {
  command: 'cat',
  aliases: ['catapi'],
  category: 'image',
  description: 'ABIX-AE Auto Generated Plugin - cat',
  usage: '.cat',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://api.thecatapi.com/v1/images/search`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data[0].url;
      const txt = "";

      const finalTxt = `╭───「 🌐 *CAT* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('cat error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
