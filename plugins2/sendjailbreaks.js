const fs = require('fs');
const path = require('path');
const isOwner = require('../lib/isOwner');

module.exports = {
  command: 'sendjailbreaks',
  aliases: ['sj'],
  category: 'tools',
  description: 'Send all jailbreak files to a specific channel',
  usage: '.sendjailbreaks <channel_jid>',
  
  async handler(sock, message, args, context) {
      const chatId = context.chatId || message.key.remoteJid;
      const senderId = message.key.participant || message.key.remoteJid;
      
      // Admin check
      const isOwner = await isOwner(senderId, sock, chatId);
      if (!isOwner) {
          return await sock.sendMessage(chatId, { text: `❌ *Sirf Admin (Owner) is command ko use kar sakta hai.*` }, { quoted: message });
      }
      
      // Get channel JID from command arguments or use default
      const defaultJid = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
      const channelJid = args.join(' ').trim() || defaultJid;
      if (!channelJid.includes('@newsletter')) {
          return await sock.sendMessage(chatId, { text: `❌ Bara-e-meharbani sahi Channel JID dain.\nFormat: .sendjailbreaks 123456789012345678@newsletter` }, { quoted: message });
      }

      const jailbreaksDir = path.join(__dirname, '../data/jailbreaks');
      
      if (!fs.existsSync(jailbreaksDir)) {
          return await sock.sendMessage(chatId, { text: `❌ data/jailbreaks folder nahi mila.` }, { quoted: message });
      }

      const files = fs.readdirSync(jailbreaksDir).filter(f => f.endsWith('.txt'));
      
      if (files.length === 0) {
          return await sock.sendMessage(chatId, { text: `❌ data/jailbreaks folder mein koi .txt file nahi mili.` }, { quoted: message });
      }

      await sock.sendMessage(chatId, { text: `⏳ Files channel mein transfer ho rahi hain... (Total: ${files.length})` }, { quoted: message });

      let successCount = 0;

      for (const file of files) {
          try {
              const filePath = path.join(jailbreaksDir, file);
              const content = fs.readFileSync(filePath, 'utf-8');
              
              // Remove .txt for the title
              const baseName = file.replace(/\.txt$/i, '');
              const displayName = baseName.replace(/-/g, ' ').toUpperCase();
              
              const header = `*${displayName} JAILBREAK SHARE BY ABIX-AE*\n` +
                             `📢 *Join our channel for more updates:*\n` +
                             `👉 https://whatsapp.com/channel/0029VbE7AW8GOj9rTFZnej0y\n\n`;

              await sock.sendMessage(
                  channelJid, 
                  { 
                      text: header + content
                  }
              );
              
              successCount++;
              // Sleep for 2 seconds to avoid rate limits
              await new Promise(r => setTimeout(r, 2000));
          } catch (err) {
              console.error(`Error sending ${file} to channel:`, err);
          }
      }

      await sock.sendMessage(chatId, { text: `✅ Transfer complete! ${successCount}/${files.length} files channel mein send ho chuki hain.` }, { quoted: message });
  }
};
