const axios = require('axios');

module.exports = {
  command: 'qr',
  category: 'utility',
  description: 'Generate QR code',
  usage: '.qr [text]',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = args.join(' ');
    
    
    try {
      let url = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&data={args}';
      if (url.includes('{args}')) {
        if (!input) return sock.sendMessage(chatId, { text: '❌ Please provide text for this command.' }, { quoted: message });
        url = url.replace('{args}', encodeURIComponent(input));
      }
      
      const config = { headers: {} };
      if (url.includes('icanhazdadjoke')) config.headers['Accept'] = 'application/json';
      
      const { data } = await axios.get(url, { responseType: 'arraybuffer' });
      
      await sock.sendMessage(chatId, { 
        image: data, 
        caption: `*ABIX-AE | QR*`,
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363413637544342@newsletter',
            newsletterName: 'ABIX-AE',
            serverMessageId: -1
          }
        }
      }, { quoted: message });
      
    } catch (error) {
      console.error('Error in qr:', error.message);
      await sock.sendMessage(chatId, { text: '❌ An error occurred or the API is down.' }, { quoted: message });
    }
    
  }
};
