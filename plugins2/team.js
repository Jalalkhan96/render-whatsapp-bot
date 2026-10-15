const axios = require('axios');

module.exports = {
  command: 'team',
  aliases: ['teamapi'],
  category: 'sports',
  description: 'ABIX-AE Auto Generated Plugin - team',
  usage: '.team',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(chatId, { text: '❌ Team ka naam likho bhai!' }, { quoted: message });
    }
    

    try {
      const apiUrl = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=` + encodeURIComponent(q) ;
      const res = await axios.get(apiUrl);

      const imgUrl = res.data.teams && res.data.teams[0] ? res.data.teams[0].strTeamBadge : null;
      const txt = res.data.teams && res.data.teams[0] ? "🏟️ Team: " + res.data.teams[0].strTeam + "\nSport: " + res.data.teams[0].strSport + "\nLeague: " + res.data.teams[0].strLeague + "\nStadium: " + res.data.teams[0].strStadium : "Team nahi mili!";

      const finalTxt = `╭───「 🏆 *TEAM* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      if (imgUrl) {
        await sock.sendMessage(chatId, { image: { url: imgUrl }, caption: finalTxt }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: finalTxt }, { quoted: message });
      }
    } catch (err) {
      console.error('team error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Sports API down hai ya score fetch nahi ho raha, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
