const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'profilecard',
  aliases: ['publiccard', 'shareprofile'],
  category: 'stalk',
  description: 'Create a safe public-profile sharing card',
  usage: '.profilecard <platform> <username>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const platform = (args[0] || '').toLowerCase();
    const username = (args[1] || '').replace(/^@/, '').trim();
    const bases = {
      ig: ['Instagram', 'https://instagram.com/'],
      instagram: ['Instagram', 'https://instagram.com/'],
      tt: ['TikTok', 'https://tiktok.com/@'],
      tiktok: ['TikTok', 'https://tiktok.com/@'],
      yt: ['YouTube', 'https://youtube.com/@'],
      youtube: ['YouTube', 'https://youtube.com/@'],
      x: ['X', 'https://x.com/'],
      twitter: ['X', 'https://x.com/']
      ,github: ['GitHub', 'https://github.com/']
      ,reddit: ['Reddit', 'https://reddit.com/u/']
      ,twitch: ['Twitch', 'https://twitch.tv/']
      ,telegram: ['Telegram', 'https://t.me/']
    };
    const selected = bases[platform];
    if (!selected || !/^[a-zA-Z0-9._-]{2,50}$/.test(username)) {
      return sock.sendMessage(chatId, {
        text: '⚡ Format:\n.profilecard ig <username>\n.profilecard tt <username>\n.profilecard yt <username>',
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    }

    const [label, base] = selected;
    const url = base + encodeURIComponent(username);
    const text =
      `╭───「 🪪 *PUBLIC PROFILE CARD* 」\n` +
      `╰───────────────○\n\n` +
      `📌 Platform: *${label}*\n` +
      `👤 Username: *@${username}*\n` +
      `🔗 ${url}\n\n` +
      `🔒 Sirf public profile share ki ja rahi hai.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD.contextInfo }, { quoted: message });
  }
};
