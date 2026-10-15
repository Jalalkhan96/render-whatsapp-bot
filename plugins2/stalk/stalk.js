const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'stalk',
  aliases: ['stalkk', 'osint'],
  category: 'stalk',
  description: 'Social stalk — .stalk ig|tt <user...> (up to 10)',
  usage: '.stalk ig <user1 user2...>  •  .stalk tt <user1 user2...>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const [plat, ...rest] = args.map(a => a.replace(/^@/, '').trim());
    const users = rest.filter(Boolean).slice(0, 10);

    if (!plat || !['ig', 'tt', 'tiktok', 'instagram'].includes(plat.toLowerCase())) {
      return await sock.sendMessage(chatId, {
        text:
          `🕵️ *SOCIAL STALK*\n\n` +
          `└ ⚡ \`.stalk ig <user...>\` — Instagram (Max 10)\n` +
          `└ ⚡ \`.stalk tt <user...>\` — TikTok (Max 10)\n\n` +
          `Examples:\n` +
          `   .stalk ig cristiano messi\n` +
          `   .stalk tt theonionknight scout2015\n\n` +
          `💡 Media: .dl <url> download karo.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    const isIG = plat.toLowerCase().startsWith('inst') || plat.toLowerCase() === 'ig';
    if (!users.length) {
      return await sock.sendMessage(chatId, {
        text: `⚡ Use ke liye username do: .stalk ${plat} <user1> [user2...]`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    const target = (isIG ? 'instalk' : 'ttstalk');
    const cmd = (sock._cmdHandler?.commands || {})[target];
    if (cmd && typeof cmd.handler === 'function') {
      return await cmd.handler(sock, message, users, context);
    }

    // fallback: try loading the plugin handler directly
    try {
      const mod = require(isIG ? '../stalk/instalk' : '../ttstalk');
      return await mod.handler(sock, message, users, context);
    } catch (e) {
      await sock.sendMessage(chatId, {
        text: `❌ ${isIG ? 'instalk' : 'ttstalk'} module load nahi hua: ${e.message}`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};