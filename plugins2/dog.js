const axios = require('axios');

module.exports = {
  command: 'dog',
  aliases: ['dogapi'],
  category: 'image',
  description: 'ABIX-AE Auto Generated Plugin - dog',
  usage: '.dog',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://dog.ceo/api/breeds/image/random`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.message;
      const txt = "";

      const finalTxt = `╭───「 🌐 *DOG* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('dog error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
