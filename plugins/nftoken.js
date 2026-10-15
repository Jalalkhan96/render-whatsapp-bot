const axios = require('axios');

module.exports = {
  command: 'nftoken',
  aliases: ['netflix'],
  category: 'tools',
  description: 'Generate Netflix Token',
  usage: '.nftoken <email>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ');
    
    if (!text) {
      return await sock.sendMessage(chatId, { text: `❌ Email belum diisi!\n\nContoh:\n.nftoken example@gmail.com` }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '⏳ Sedang generate token...' }, { quoted: message });

    try {
      const response = await axios.get(`https://api.zenkey.my.id/api/tools/netflix-token?email=${encodeURIComponent(text)}`);
      
      if (!response.data.status) {
        return await sock.sendMessage(chatId, { text: '❌ Gagal generate token, email mungkin tidak valid atau server sedang error.' }, { quoted: message });
      }

      const result = response.data.result;

      let msg = `🎟 *NETFLIX TOKEN GENERATOR*\n\n`;
      msg += `📧 *Email:* ${result.email}\n`;
      msg += `🔐 *Token:* \n\`\`\`${result.token}\`\`\`\n\n`;
      msg += `*Cara Menggunakan Token:*\n${result.howToUse}\n\n`;
      msg += `📌 *Note:* Expired Token\n`;

      await sock.sendMessage(chatId, { text: msg }, { quoted: message });

    } catch (e) {
      console.log('NFTOKEN ERROR:', e.response?.data || e.message || e);
      let errorMessage = e.response?.data?.message || e.message || 'Terjadi kesalahan tidak diketahui';
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') errorMessage = 'Request API timeout. Coba lagi.';
      await sock.sendMessage(chatId, { text: `❌ *GAGAL*\n\n${errorMessage}` }, { quoted: message });
    }
  }
};
