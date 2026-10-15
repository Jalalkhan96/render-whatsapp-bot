const axios = require('axios');
module.exports = {
  command: 'sfw', aliases: ['sweeb'], category: 'anime',
  description: 'Safe anime/waifu image from Waifu.im',
  usage: '-sfw [tag] | -waifu [tag]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const tag = String(args.join(' ').trim() || '').toLowerCase();
    try {
      const params = { IsNsfw: 'False', OrderBy: 'Random', PageSize: 1 };
      if (tag) params.IncludedTags = tag;
      const { data } = await axios.get('https://api.waifu.im/images', { params, headers: { 'Accept-Version': 'v7', Accept: 'application/json' }, timeout: 30000 });
      const item = data?.items?.[0];
      if (!item?.url) throw new Error('No safe anime image returned.');
      const tags = Array.isArray(item.tags) ? item.tags.map(x => x.name || x.slug).join(', ') : '';
      return sock.sendMessage(chatId, { image: { url: item.url }, caption: `🌸 *WAIFU / SFW*${tags ? `\n🏷️ ${tags}` : ''}` }, { quoted: message });
    } catch (e) {
      return sock.sendMessage(chatId, { text: `❌ Safe anime image failed.\n${e.message}` }, { quoted: message });
    }
  }
};
