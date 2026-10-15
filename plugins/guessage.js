const axios = require('axios');

module.exports = {
  command: 'guessage',
  aliases: ['age', 'predictage'],
  category: 'fun',
  description: 'Predict the age of a person based on their name',
  usage: '.guessage <name>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const name = args[0];

    if (!name) {
      return await sock.sendMessage(chatId, { text: '❌ Bhai kisi ka naam toh likho! (Jaise: .guessage Ali)' }, { quoted: message });
    }

    try {
      const res = await axios.get(`https://api.agify.io?name=${encodeURIComponent(name)}`);
      const data = res.data;

      if (!data.age) {
        return await sock.sendMessage(chatId, { text: `❌ Mafi chahta hoon bhai, '${name}' ka data system mein nahi mila!` }, { quoted: message });
      }

      const info = `
🔮 *AGE PREDICTOR API* 🔮
---
👤 *Naam:* ${data.name.charAt(0).toUpperCase() + data.name.slice(1)}
🎂 *Predicted Age:* ${data.age} saal
📊 *Count (Confidence):* ${data.count} log is naam ke
---
*Note:* Yeh API naam ke hisab se andaza lagati hai! 😄
      `.trim();

      await sock.sendMessage(chatId, { text: info }, { quoted: message });

    } catch (err) {
      console.log('Agify error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Baba ji ka ilm khatam ho gaya hai, thodi der baad aana!' }, { quoted: message });
    }
  }
};
