const axios = require('axios');

module.exports = {
  command: 'android',
  aliases: ['an1', 'an1apk', 'apk'],
  category: 'apks',
  description: 'Search APKs and download by reply',
  usage: '.android <apk_name>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args.join(' ').trim();

    try {
      if (!query) {
        return await sock.sendMessage(chatId, { text: '*Please provide an APK name.*\nExample: .apk capcut' }, { quoted: message });
      }

      await sock.sendMessage(chatId, { text: '🔎 Searching for APKs...' }, { quoted: message });

      const apiUrl = `http://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}`;
      const { data } = await axios.get(apiUrl);

      if (!data?.datalist?.list || data.datalist.list.length === 0) {
        return await sock.sendMessage(chatId, { text: '❌ No APKs found.' }, { quoted: message });
      }

      // Limit results to 5
      const results = data.datalist.list.slice(0, 5);
      const first = results[0];

      let caption = `📱 *APK Search Results for:* *${query}*\n\n`;
      caption += `↩️ *Reply with a number to download*\n\n`;

      results.forEach((item, i) => {
        caption +=
          `*${i + 1}.* ${item.name}\n` +
          `👨‍💻 Developer: ${item.developer?.name || 'Unknown'}\n` +
          `⭐ Rating: ${item.stats?.prating?.avg || item.stats?.rating?.avg || 'N/A'}\n` +
          `📦 Size: ${(item.file?.filesize / (1024 * 1024)).toFixed(2)} MB\n\n`;
      });

      const sentMsg = await sock.sendMessage(chatId, { image: { url: first.icon }, caption }, { quoted: message });

      const timeout = setTimeout(async () => {
        sock.ev.off('messages.upsert', listener);
        await sock.sendMessage(chatId, { text: '⏱ APK selection expired. Please search again.' }, { quoted: sentMsg });
      }, 5 * 60 * 1000);

      const listener = async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.remoteJid !== chatId) return;

        const ctx = m.message?.extendedTextMessage?.contextInfo;
        if (!ctx?.stanzaId || ctx.stanzaId !== sentMsg.key.id) return;

        const replyText =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          '';

        const choice = parseInt(replyText.trim());
        if (isNaN(choice) || choice < 1 || choice > results.length) {
          return await sock.sendMessage(chatId, { text: `❌ Invalid choice. Pick 1-${results.length}.` }, { quoted: m });
        }

        clearTimeout(timeout);
        sock.ev.off('messages.upsert', listener);

        const selected = results[choice - 1];
        const apkUrl = selected.file?.path;
        
        if (!apkUrl) {
           return await sock.sendMessage(chatId, { text: '❌ Download link not found for this APK.' }, { quoted: m });
        }
        
        await sock.sendMessage(chatId, { text: `⬇️ Downloading *${selected.name}*...\n⏱ Please wait, this might take a minute depending on the size...` }, { quoted: m });
        
        const safeName = selected.name.replace(/[^\w.-]/g, '_');

        const apkCaption =
          `📦 *APK Downloaded*\n\n` +
          `📛 Name: ${selected.name}\n` +
          `⭐ Rating: ${selected.stats?.prating?.avg || selected.stats?.rating?.avg || 'N/A'}\n` +
          `📦 Size: ${(selected.file?.filesize / (1024 * 1024)).toFixed(2)} MB\n` +
          `📅 Published: ${selected.added}\n\n`;

        await sock.sendMessage(chatId, { 
            document: { url: apkUrl }, 
            fileName: `${safeName}.apk`, 
            mimetype: 'application/vnd.android.package-archive', 
            caption: apkCaption 
        }, { quoted: m });
      };

      sock.ev.on('messages.upsert', listener);

    } catch (err) {
      console.error('❌ Android Plugin Error:', err.message);
      await sock.sendMessage(chatId, { text: '❌ Failed to process APK request. API might be down.' }, { quoted: message });
    }
  }
};
