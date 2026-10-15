const axios = require('axios');

module.exports = {
  command: 'nationalize',
  aliases: ['nationalizeapi'],
  category: 'info',
  description: 'ABIX-AE Auto Generated Plugin - nationalize',
  usage: '.nationalize',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(chatId, { text: '❌ Naam likho bhai!' }, { quoted: message });
    }
    

    try {
      const apiUrl = `https://api.nationalize.io?name=` + encodeURIComponent(q) ;
      const res = await axios.get(apiUrl);

      const imgUrl = null;
      const txt = "Name: " + res.data.name + "\nCountry: " + (res.data.country[0] ? res.data.country[0].country_id : "Unknown");

      const finalTxt = `╭───「 🌐 *NATIONALIZE* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('nationalize error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
