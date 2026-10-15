const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'userfind', aliases: ['profilefind'], category: 'stalk', description: 'Check a public profile URL reachability', usage: '.userfind <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const user = (args[0] || '').replace(/^@/, '');
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(user)) return sock.sendMessage(chatId, { text: '⚡ Username do. Result only public URL reachability hoga.', ...FAKE_FORWARD }, { quoted: message });
    const urls = ['https://github.com/', 'https://instagram.com/', 'https://tiktok.com/@', 'https://youtube.com/@'].map(base => base + encodeURIComponent(user));
    const results = [];
    for (const url of urls) { try { const r = await axios.head(url, { timeout: 8000, maxRedirects: 2, validateStatus: () => true }); results.push(`${r.status < 400 ? 'REACHABLE' : 'UNVERIFIED'} • ${url}`); } catch { results.push(`ERROR • ${url}`); } }
    return sock.sendMessage(chatId, { text: `🔎 *PUBLIC URL CHECK*\n\n${results.join('\n')}\n\n⚠️ Reachable means only that the URL responded; account identity is not confirmed.`, ...FAKE_FORWARD }, { quoted: message });
  }
};
