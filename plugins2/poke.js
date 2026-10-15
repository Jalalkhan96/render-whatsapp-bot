const axios = require('axios');

module.exports = {
  command: 'poke',
  aliases: ['pokeapi'],
  category: 'info',
  description: 'ABIX-AE Auto Generated Plugin - poke',
  usage: '.poke',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(chatId, { text: '❌ Pokemon naam likho!' }, { quoted: message });
    }
    

    try {
      const apiUrl = `https://pokeapi.co/api/v2/pokemon/` + encodeURIComponent(q) ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.sprites.front_default;
      const txt = "Name: " + res.data.name + "\nWeight: " + res.data.weight;

      const finalTxt = `╭───「 🌐 *POKE* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('poke error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 API thodi busy hai ya error aagya, baad me aana!' }, { quoted: message });
    }
  }
};
