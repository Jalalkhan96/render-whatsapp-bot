const axios = require('axios');

module.exports = {
  command: 'fakeml',
  aliases: ['fml'],
  category: 'image',
  description: 'Generate Fake ML Lobby Image',
  usage: '.fakeml <nama> <rank> <bintang>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    if (args.length < 3) {
      return await sock.sendMessage(chatId, { text: `❌ Format salah!\n\nContoh:\n.fakeml Player1 Mythic 50` }, { quoted: message });
    }

    const [nama, rank, ...bintangArr] = args;
    const bintang = bintangArr.join(' ');

    await sock.sendMessage(chatId, { text: '⏳ Sedang membuat gambar...' }, { quoted: message });

    try {
      const url = `https://api.zenkey.my.id/api/maker/ml-lobby?name=${encodeURIComponent(nama)}&rank=${encodeURIComponent(rank)}&star=${encodeURIComponent(bintang)}`;
      
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      
      if (!response.data) {
        return await sock.sendMessage(chatId, { text: '❌ Gagal membuat gambar.' }, { quoted: message });
      }

      await sock.sendMessage(chatId, { 
        image: response.data, 
        caption: `🎮 *FAKE ML LOBBY*\n\n👤 *Nama:* ${nama}\n🎖 *Rank:* ${rank}\n⭐ *Bintang:* ${bintang}` 
      }, { quoted: message });

    } catch (e) {
      console.log('FAKEML ERROR:', e);
      await sock.sendMessage(chatId, { text: `❌ *GAGAL*\n\nTerjadi kesalahan.` }, { quoted: message });
    }
  }
};
