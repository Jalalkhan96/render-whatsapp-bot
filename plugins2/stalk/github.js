const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'github',
  aliases: ['ghprofile', 'gh'],
  category: 'stalk',
  description: 'Lookup a public GitHub profile',
  usage: '.github <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const user = String(args[0] || '').replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(user)) return sock.sendMessage(chatId, { text: '⚡ GitHub username do. Example: .github torvalds', ...FAKE_FORWARD }, { quoted: message });
    try {
      const { data } = await axios.get(`https://api.github.com/users/${encodeURIComponent(user)}`, {
        timeout: 12000, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ABIX-AE' }
      });
      const text = `🐙 *GITHUB PROFILE*\n\n👤 ${data.name || data.login}\n🆔 @${data.login}\n📝 ${data.bio || 'No bio'}\n🏢 ${data.company || 'N/A'}\n📍 ${data.location || 'N/A'}\n📦 Repos: ${data.public_repos}\n📜 Gists: ${data.public_gists}\n👥 Followers: ${data.followers} • Following: ${data.following}\n🔗 ${data.html_url}\n📅 Joined: ${new Date(data.created_at).toDateString()}\n\n✅ Public GitHub data only.`;
      return sock.sendMessage(chatId, { image: { url: data.avatar_url }, caption: text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      const status = error.response?.status;
      const reason = status === 404 ? 'User not found.' : status === 403 ? 'GitHub rate limit reached.' : error.message;
      return sock.sendMessage(chatId, { text: `❌ GitHub: ${reason}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};
