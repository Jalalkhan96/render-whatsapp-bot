const axios = require('axios');

module.exports = {
  command: 'shiba',
  aliases: ['shibaapi'],
  category: 'image',
  description: 'ABIX-AE Auto Generated Plugin - shiba',
  usage: '.shiba',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `http://shibe.online/api/shibes?count=1`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data[0];
      const txt = "";

      const finalTxt = `╭───「 🌐 *SHIBA* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('shiba error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
