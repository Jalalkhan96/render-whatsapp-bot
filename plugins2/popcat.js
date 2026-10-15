const axios = require('axios');

module.exports = {
  command: 'popcat',
  aliases: ['popcatapi'],
  category: 'image',
  description: 'ABIX-AE Auto Generated Plugin - popcat',
  usage: '.popcat',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://api.popcat.xyz/car`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.image;
      const txt = res.data.title;

      const finalTxt = `╭───「 🌐 *POPCAT* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('popcat error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
