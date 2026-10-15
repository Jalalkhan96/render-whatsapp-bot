const axios = require('axios');

module.exports = {
  command: 'duck',
  aliases: ['duckapi'],
  category: 'image',
  description: 'ABIX-AE Auto Generated Plugin - duck',
  usage: '.duck',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://random-d.uk/api/random`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.url;
      const txt = "";

      const finalTxt = `╭───「 🌐 *DUCK* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('duck error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
