const { getChannelInfo } = require('../../lib/channelInfo');
const { platform, username } = require('../../lib/stalkTools');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'socialcompare', aliases: ['scompare'], category: 'stalk', description: 'Compare two public handles without inventing stats', usage: '.socialcompare <platform> <user1> <user2>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const selected = platform(args[0]); const a = username(args[1]); const b = username(args[2]);
    if (!selected || !a || !b) return sock.sendMessage(chatId, { text: '⚡ Format: .socialcompare github user1 user2', ...FAKE_FORWARD }, { quoted: message });
    const base = selected[1]; const text = `⚔️ *PUBLIC HANDLE COMPARE*\n\nPlatform: ${selected[0]}\n\n1️⃣ @${a}\n${base}${encodeURIComponent(a)}\n\n2️⃣ @${b}\n${base}${encodeURIComponent(b)}\n\n⚠️ No popularity/identity claim — URLs only.`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};
