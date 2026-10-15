const axios = require('axios');

module.exports = {
  command: 'excuse',
  aliases: ['excuseapi'],
  category: 'fun',
  description: 'ABIX-AE Auto Generated Plugin - excuse',
  usage: '.excuse',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://excuser-three.vercel.app/v1/excuse`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = res.data[0].excuse;

      const finalTxt = `╭───「 🌐 *EXCUSE* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('excuse error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
