const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { profileUrl, username, platform } = require('../../lib/stalkTools');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'avatar', aliases: ['pfp', 'profileavatar'], category: 'stalk', description: 'Fetch a public avatar via Unavatar', usage: '.avatar <platform> <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const user = username(args[1]); const url = user && profileUrl(args[0], user);
    if (!url || !platform(args[0])) return sock.sendMessage(chatId, { text: '⚡ Format: .avatar github torvalds', ...FAKE_FORWARD }, { quoted: message });
    const avatarUrl = `https://unavatar.io/${String(args[0]).toLowerCase()}/${encodeURIComponent(user)}`;
    try { await axios.head(avatarUrl, { timeout: 12000, validateStatus: status => status < 500 }); return sock.sendMessage(chatId, { image: { url: avatarUrl }, caption: `🖼️ Public avatar\n${url}\n⚠️ Resolver result unverified.`, ...FAKE_FORWARD }, { quoted: message }); }
    catch (error) { return sock.sendMessage(chatId, { text: `❌ Avatar resolve nahi hua: ${error.message}`, ...FAKE_FORWARD }, { quoted: message }); }
  }
};
