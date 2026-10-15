const axios = require('axios');

module.exports = {
  command: 'urban',
  aliases: ['slang', 'udict'],
  category: 'search',
  description: 'Search for slang definitions on Urban Dictionary',
  usage: '.urban <word>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const word = args.join(' ').trim();

    if (!word) {
      return await sock.sendMessage(chatId, { text: '❌ Bhai koi lafz toh likho jiska matlab janna hai! (Jaise: .urban rizz)' }, { quoted: message });
    }

    try {
      const res = await axios.get(`http://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`);
      const data = res.data.list;

      if (!data || data.length === 0) {
        return await sock.sendMessage(chatId, { text: `❌ Ajeeb! '${word}' ka matlab Urban Dictionary ko bhi nahi pata!` }, { quoted: message });
      }

      const topResult = data[0];
      const definition = topResult.definition.replace(/\[|\]/g, ''); // Remove brackets around words
      const example = topResult.example.replace(/\[|\]/g, '');

      const info = `
📚 *URBAN DICTIONARY* 📚
---
🗣️ *Lafz:* ${topResult.word}
📖 *Matlab:* ${definition}

💬 *Misaal (Example):*
_${example}_

👍 ${topResult.thumbs_up} | 👎 ${topResult.thumbs_down}
✨ *Powered by ABIX-AE*
      `.trim();

      await sock.sendMessage(chatId, { text: info }, { quoted: message });

    } catch (err) {
      console.log('Urban Dict error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Dictionary library mein gum ho gayi hai, dobara try karo!' }, { quoted: message });
    }
  }
};
