const axios = require('axios');

module.exports = {
  command: 'player',
  aliases: ['playerapi'],
  category: 'sports',
  description: 'ABIX-AE Auto Generated Plugin - player',
  usage: '.player',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(chatId, { text: '❌ Player ka naam likho bhai!' }, { quoted: message });
    }
    

    try {
      const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=` + encodeURIComponent(q) ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.player && res.data.player[0] ? res.data.player[0].strThumb : null;
      const txt = res.data.player && res.data.player[0] ? "🏃 Player: " + res.data.player[0].strPlayer + "\nSport: " + res.data.player[0].strSport + "\nTeam: " + res.data.player[0].strTeam + "\nNationality: " + res.data.player[0].strNationality : "Player nahi mila!";

      const finalTxt = `╭───「 🏆 *PLAYER* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('player error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
