const axios = require('axios');

module.exports = {
  command: 'fakeffduo',
  aliases: ['ffduo'],
  category: 'image',
  description: 'Generate Fake FF Duo Image',
  usage: '.fakeffduo <nama1> <nama2>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    if (args.length < 2) {
      return await sock.sendMessage(chatId, { text: `❌ Format salah!\n\nContoh:\n.fakeffduo Jagoan Beban` }, { quoted: message });
    }

    const nama1 = args[0];
    const nama2 = args.slice(1).join(' ');

    await sock.sendMessage(chatId, { text: '⏳ Sedang membuat gambar...' }, { quoted: message });

    try {
      const url = `https://api.zenkey.my.id/api/maker/ff-duo?text1=${encodeURIComponent(nama1)}&text2=${encodeURIComponent(nama2)}`;
      
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      
      if (!response.data) {
        return await sock.sendMessage(chatId, { text: '❌ Gagal membuat gambar.' }, { quoted: message });
      }

      await sock.sendMessage(chatId, { 
        image: response.data, 
        caption: `🎮 *FAKE FF DUO*\n\n👤 *Player 1:* ${nama1}\n👤 *Player 2:* ${nama2}` 
      }, { quoted: message });

    } catch (e) {
      console.log('FAKEFFDUO ERROR:', e);
      await sock.sendMessage(chatId, { text: `❌ *GAGAL*\n\nTerjadi kesalahan.` }, { quoted: message });
    }
  }
};
