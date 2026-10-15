const fs = require('fs');
const path = require('path');

module.exports = {
  command: 'deepseek',
  category: 'ai',
  description: 'Send DeepSeek jailbreak code via fake forward',
  usage: '.deepseek',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const filePath = path.join(__dirname, '..', 'data', 'jailbreaks', 'deepseek.txt');
    
    let textToSend = '';
    try {
      if (fs.existsSync(filePath)) {
        textToSend = fs.readFileSync(filePath, 'utf8');
      } else {
        textToSend = '[File deepseek.txt belum ditambahkan di folder data/jailbreaks/]';
      }
    } catch (e) {
      console.log('Error reading deepseek jailbreak file:', e);
      textToSend = '[Gagal membaca file deepseek.txt]';
    }

    await sock.sendMessage(chatId, { 
      text: textToSend, 
      contextInfo: {
        isForwarded: true,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
            newsletterJid: "1234567890@newsletter",
            newsletterName: "ABIX-AE",
            serverMessageId: -1
        }
      }
    }, { quoted: message });
  }
};
