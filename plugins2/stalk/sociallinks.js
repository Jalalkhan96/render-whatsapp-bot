const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'sociallinks',
  aliases: ['findsocial', 'profilelinks'],
  category: 'stalk',
  description: 'Build public social profile links from a username',
  usage: '.sociallinks <username>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const username = (args[0] || '').replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(username)) {
      return sock.sendMessage(chatId, {
        text: '⚡ Simple username do.\nExample: .sociallinks @cristiano',
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    }

    const encoded = encodeURIComponent(username);
    const text =
      `╭───「 🔗 *PUBLIC SOCIAL LINKS* 」\n` +
      `│ @${username}\n` +
      `╰───────────────○\n\n` +
      `📸 Instagram: https://instagram.com/${encoded}\n` +
      `🎵 TikTok: https://tiktok.com/@${encoded}\n` +
      `▶️ YouTube: https://youtube.com/@${encoded}\n` +
      `𝕏 X: https://x.com/${encoded}\n\n` +
      `🐙 GitHub: https://github.com/${encoded}\n` +
      `👽 Reddit: https://reddit.com/u/${encoded}\n` +
      `🎮 Twitch: https://twitch.tv/${encoded}\n` +
      `✈️ Telegram: https://t.me/${encoded}\n\n` +
      `⚠️ Ye sirf public links hain — account existence verify nahi ki gayi.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
