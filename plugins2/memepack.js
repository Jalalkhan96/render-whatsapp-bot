const fetch = require('node-fetch');
const { writeExifImg } = require('../lib/exif');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  command: 'memepack',
  aliases: ['stickerbomb', 'memesticker'],
  category: 'fun',
  description: 'Send a barrage of meme stickers (Limited to 10 for anti-spam)',
  usage: '.memepack',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    
    try {
      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      await sock.sendMessage(chatId, { text: '🔥 Loading 10 fresh memes and converting to stickers... Please wait!' }, { quoted: message });

      const amount = 10; // Anti-spam limit
      const res = await fetch(`https://meme-api.com/gimme/${amount}`);
      const data = await res.json();
      
      if (!data.memes || !data.memes.length) {
        throw new Error("Couldn't fetch memes.");
      }

      let count = 0;
      for (const meme of data.memes) {
        if (!meme.url) continue;
        
        try {
          const imgRes = await fetch(meme.url);
          const buffer = await imgRes.buffer();
          
          const stickerOptions = { packname: 'ABIX-AE Memes', author: 'Bot' };
          const stickerBuffer = await writeExifImg(buffer, stickerOptions);
          
          await sock.sendMessage(chatId, { sticker: stickerBuffer });
          count++;
          await delay(1500); // 1.5 second delay to avoid ban

        } catch (err) {
          console.error("Error sending meme sticker:", err);
        }
      }

      await sock.sendMessage(chatId, { text: `✅ Successfully sent ${count} meme stickers!` }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      
    } catch (e) {
      console.error('memepack error:', e);
      await sock.sendMessage(chatId, { text: '❌ Failed to fetch memes.' }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
  }
};
