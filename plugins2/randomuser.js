const axios = require('axios');

module.exports = {
  command: 'randomuser',
  aliases: ['randomuserapi'],
  category: 'info',
  description: 'ABIX-AE Auto Generated Plugin - randomuser',
  usage: '.randomuser',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://randomuser.me/api/`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.results[0].picture.large;
      const txt = "Name: " + res.data.results[0].name.first + " " + res.data.results[0].name.last + "\nEmail: " + res.data.results[0].email + "\nCountry: " + res.data.results[0].location.country;

      const finalTxt = `╭───「 🌐 *RANDOMUSER* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('randomuser error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
