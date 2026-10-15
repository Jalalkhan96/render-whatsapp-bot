const axios = require('axios');

module.exports = {
  command: 'joke-prog',
  aliases: ['joke-progapi'],
  category: 'fun',
  description: 'ABIX-AE Auto Generated Plugin - joke-prog',
  usage: '.joke-prog',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://v2.jokeapi.dev/joke/Programming?type=single`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data.joke;

      const finalTxt = `╭───「 🌐 *JOKE-PROG* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('joke-prog error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
