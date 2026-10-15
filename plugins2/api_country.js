const axios = require('axios');

module.exports = {
  command: 'country',
  category: 'education',
  description: 'Get country info',
  usage: '.country [text]',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = args.join(' ');
    
    
    try {
      let url = 'https://en.wikipedia.org/api/rest_v1/page/summary/{args}';
      if (url.includes('{args}')) {
        if (!input) return sock.sendMessage(chatId, { text: '❌ Please provide text for this command.' }, { quoted: message });
        const formattedInput = input.trim().charAt(0).toUpperCase() + input.trim().slice(1).toLowerCase();
        url = url.replace('{args}', encodeURIComponent(formattedInput));
      }
      
      const config = { 
        headers: {
          'User-Agent': 'ABIX-AE-Bot/1.0 (https://github.com/ABIX-AE)'
        } 
      };
      
      const { data } = await axios.get(url, config);
      
      let replyText = `*ABIX-AE | COUNTRY INFO*\n\n`;
      
      if (typeof data === 'string') {
        replyText += data;
      } else {
        const text = data.extract || data.description || JSON.stringify(data, null, 2).substring(0, 500);
        replyText += text;
      }
      
      // Send image or audio if URL is found
      const mediaUrl = data.thumbnail?.source || data.originalimage?.source;
      if (mediaUrl && mediaUrl.startsWith('http') && mediaUrl.match(/\.(jpeg|jpg|gif|png|svg)$/i)) {
         return sock.sendMessage(chatId, { image: { url: mediaUrl }, caption: replyText }, { quoted: message });
      }
      
      // Send text
      await sock.sendMessage(chatId, { text: replyText }, { quoted: message });
      
    } catch (error) {
      console.error('Error in country:', error.message);
      await sock.sendMessage(chatId, { text: '❌ An error occurred or the API is down.' }, { quoted: message });
    }
    
  }
};
