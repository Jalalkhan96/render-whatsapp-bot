const axios = require('axios');

module.exports = {
  command: 'dictionary',
  category: 'education',
  description: 'Get word definition',
  usage: '.dictionary [text]',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = args.join(' ');
    
    
    try {
      let url = 'https://api.dictionaryapi.dev/api/v2/entries/en/{args}';
      if (url.includes('{args}')) {
        if (!input) return sock.sendMessage(chatId, { text: '❌ Please provide text for this command.' }, { quoted: message });
        url = url.replace('{args}', encodeURIComponent(input));
      }
      
      const config = { headers: {} };
      if (url.includes('icanhazdadjoke')) config.headers['Accept'] = 'application/json';
      
      const { data } = await axios.get(url, config);
      
      // Simple generic formatter
      let replyText = `*ABIX-AE | DICTIONARY*\n\n`;
      
      if (typeof data === 'string') {
        replyText += data;
      } else {
        // Extract common fields dynamically
        const text = data.fact || data.joke || data.quote || data.activity || data.slip?.advice || data.answer || data.extract || JSON.stringify(data, null, 2).substring(0, 500);
        
        replyText += text;
      }
      
      // Send image or audio if URL is found
      if (data.image || data.message || data.url) {
         const mediaUrl = data.image || data.message || data.url;
         if (mediaUrl.startsWith('http') && mediaUrl.match(/\.(jpeg|jpg|gif|png)$/)) {
            return sock.sendMessage(chatId, { image: { url: mediaUrl }, caption: replyText }, { quoted: message });
         }
      }
      
      // Send text
      await sock.sendMessage(chatId, { text: replyText }, { quoted: message });
      
    } catch (error) {
      console.error('Error in dictionary:', error.message);
      await sock.sendMessage(chatId, { text: '❌ An error occurred or the API is down.' }, { quoted: message });
    }
    
  }
};
