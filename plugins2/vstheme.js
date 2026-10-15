const axios = require('axios');

module.exports = {
  command: 'wallpaper2',
  aliases: ['theme', 'vstheme'],
  category: 'media',
  description: 'Search and download high-quality wallpapers/themes',
  usage: '.wallpaper <query>',
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args.join(' ').trim() || 'sukuna';

    try {
      await sock.sendMessage(chatId, { text: `🔎 Searching wallpapers for: *${query}*...` }, { quoted: message });

      const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&sorting=random`;
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      
      const results = data.data;

      if (!results || results.length === 0) {
          // If no results, fallback to a public wallpaper API
          const fbRes = await axios.get(`https://api.waifu.pics/sfw/waifu`); // Fallback
          if (fbRes.data && fbRes.data.url) {
              return await sock.sendMessage(chatId, { image: { url: fbRes.data.url }, caption: `❌ No exact match found.\n✅ Here is a random anime wallpaper instead!` }, { quoted: message });
          }
          return await sock.sendMessage(chatId, { text: `❌ No themes/wallpapers found for "${query}".` }, { quoted: message });
      }

      // Pick a random wallpaper from the top results
      const firstResult = results[Math.floor(Math.random() * Math.min(results.length, 5))];
      
      let caption = `🖼️ *Wallpaper Found!*\n\n`;
      caption += `📌 *Category:* ${firstResult.category}\n`;
      caption += `📏 *Resolution:* ${firstResult.resolution}\n`;
      caption += `🔗 *Source:* ${firstResult.short_url}\n\n`;
      caption += `💡 _ABIX-AE Media Downloader_`;

      await sock.sendMessage(chatId, { 
          image: { url: firstResult.path }, 
          caption: caption 
      }, { quoted: message });

    } catch (error) {
      console.error('Wallpaper Error:', error.message);
      
      // Fallback
      try {
         const fallbackUrl = `https://api.waifu.pics/sfw/waifu`;
         const { data } = await axios.get(fallbackUrl);
         await sock.sendMessage(chatId, { image: { url: data.url }, caption: `❌ Error searching wallpaper API.\n✅ Random Anime Wallpaper fallback.` }, { quoted: message });
      } catch (e) {
         await sock.sendMessage(chatId, { text: '❌ Failed to search for wallpapers. API might be down.' }, { quoted: message });
      }
    }
  }
};
