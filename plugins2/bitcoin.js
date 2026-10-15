const axios = require('axios');

module.exports = {
  command: 'bitcoin',
  aliases: ['bitcoinapi'],
  category: 'info',
  description: 'ABIX-AE Auto Generated Plugin - bitcoin',
  usage: '.bitcoin',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://api.coindesk.com/v1/bpi/currentprice.json`  ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = "Bitcoin Price:\nUSD: $" + res.data.bpi.USD.rate;

      const finalTxt = `╭───「 🌐 *BITCOIN* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('bitcoin error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
