const fs = require('fs');
const path = require('path');
// Force reload to register new jailbreak aliases

const jailbreaksDir = path.join(__dirname, '../data/jailbreaks');
const files = fs.existsSync(jailbreaksDir) ? fs.readdirSync(jailbreaksDir) : [];

const fileMap = {};
const aliases = [];

files.forEach(file => {
    // Basic clean up: remove .txt, replace spaces with dashes, convert to lowercase
    let alias = file.toLowerCase().replace(/\.txt$/, '').replace(/\s+/g, '-');
    // Remove emojis or weird characters that might break command parsing
    alias = alias.replace(/[^\w-]/g, '');
    
    // Prevent conflict with the main '.jailbreak' list command
    if (alias === 'jailbreak') {
        alias = 'jailbreak-prompt';
    }
    
    if (alias) {
        aliases.push(alias);
        fileMap[alias] = file;
    }
});

// Explicitly add the list commands to the aliases so the handler catches them
const commandAliases = ['jailbreaks', 'jailbreak', ...aliases];

module.exports = {
  command: 'jailbreaks',
  aliases: commandAliases,
  category: 'tools',
  description: 'Send jailbreak prompts from the jailbreaks folder',
  usage: '.<jailbreak_name>',
  
  async handler(sock, message, args, context) {
      const chatId = context.chatId || message.key.remoteJid;
      const { getChannelInfo } = require('../lib/channelInfo');
      
      const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      const prefix = context.prefix || (text[0].match(/^[\\/!#.$%^&*+=\-?<>,]/) ? text[0] : '.');
      
      // Extract the actual command used (e.g. 'chatgpt' from '.chatgpt')
      const usedAlias = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
      
      if (fileMap[usedAlias]) {
          try {
              const filePath = path.join(jailbreaksDir, fileMap[usedAlias]);
              const content = fs.readFileSync(filePath, 'utf-8');
              
              // Formatting the header as requested
              const displayName = usedAlias.replace(/-/g, ' ').toUpperCase();
              const header = `*${displayName} JAILBREAK SHARE BY ABIX-AE*\n\n`;
              
              const opts = getChannelInfo();
              opts.quoted = message;

              await sock.sendMessage(chatId, { text: header + content }, opts);
          } catch (err) {
              console.error('Error reading jailbreak file:', err);
              await sock.sendMessage(chatId, { text: `❌ Jailbreak file parhne mein masla pesh aaya.` }, { quoted: message });
          }
      } else {
          // If the main command is used without a specific alias, list them all in Urdu
          let listText = `🔓 *ABIX AI JAILBREAK MENU* 🔓\n\nNeeche diye gaye jailbreak prompts mein se koi aik muntakhib karein:\n\n`;
          aliases.forEach(a => {
              if (a === 'jailbreak-prompt') {
                  listText += `🤖 ${prefix}jailbreak\n`;
              } else {
                  listText += `🤖 ${prefix}${a}\n`;
              }
          });
          listText += `\n_Yeh message ABIX-AE channel se forward kiya gaya hai._`;

          const opts = getChannelInfo();
          opts.quoted = message;

          await sock.sendMessage(chatId, { text: listText }, opts);
      }
  }
};
