const settings = require('../settings');
const fs = require('fs');
const path = require('path');

module.exports = {
  command: 'editormenu',
  aliases: ['editor', 'xmlmenu'],
  category: 'general',
  description: 'Shows editor commands and XML presets',
  usage: `${settings.prefixes[0]}editormenu`,
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    let menuText = `╭───「 🎬 *EDITOR MENU* 」\n`;
    menuText += `│ Yahan aapke liye XML presets aur editing materials hain:\n`;
    menuText += `╰───────────────○\n\n`;

    menuText += `*📁 XML Presets*\n`;
    menuText += `└ ⚡ \`${prefix}getxml <name>\` (Search & Download XML)\n`;
    menuText += `└ ⚡ \`${prefix}randomxml\` (Get a random XML)\n\n`;
    
    menuText += `*📝 Note:*\n`;
    menuText += `Hamare paas 1500+ XML presets mojood hain!\n\n`;

    menuText += `✨ *Powered by ABIX-AE*`;

    await sock.sendMessage(chatId, { 
      text: menuText,
      contextInfo: {}
    }, { quoted: message });
  }
};
