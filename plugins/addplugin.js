const fs = require('fs');
const path = require('path');

module.exports = {
  command: 'addplugin',
  aliases: ['pluginadd', 'uploadplugin'],
  category: 'owner',
  description: 'Upload a new plugin file',
  usage: '.addplugin <name> (reply to a file or paste code)',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    // Basic owner check could be implemented here
    // if (!context.isOwner) return await sock.sendMessage(chatId, { text: 'Only owner can use this.' });

    const name = args[0];
    if (!name) {
      return await sock.sendMessage(chatId, { text: '❌ Please provide a name for the plugin.\nExample: .addplugin newplugin' }, { quoted: message });
    }

    const pluginName = name.endsWith('.js') ? name : `${name}.js`;
    const pluginPath = path.join(__dirname, pluginName);

    // If there is code in the text
    const code = args.slice(1).join(' ');
    
    if (code) {
      fs.writeFileSync(pluginPath, code);
      return await sock.sendMessage(chatId, { text: `✅ Plugin ${pluginName} successfully saved!` }, { quoted: message });
    } else {
      return await sock.sendMessage(chatId, { text: '❌ Please provide the code after the name, e.g., .addplugin name <code>' }, { quoted: message });
    }
  }
};
