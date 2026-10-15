const axios = require('axios');

module.exports = {
  command: 'img2pdf',
  category: 'utility',
  description: 'Image to PDF conversion info',
  usage: '.img2pdf [text]',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = args.join(' ');
    
    return "*Image to PDF*: Reply to an image with .pdf to convert it!"
  }
};
