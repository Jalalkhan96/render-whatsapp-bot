const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'stalkscore', aliases: ['profilescore'], category: 'stalk', description: 'Fun score from supplied username only', usage: '.stalkscore <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const value = (args[0] || '').replace(/^@/, '');
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(value)) return sock.sendMessage(chatId, { text: '⚡ Valid username do.', ...FAKE_FORWARD }, { quoted: message });
    let score = 0; for (const char of value) score = (score * 31 + char.charCodeAt(0)) % 101;
    return sock.sendMessage(chatId, { text: `🎭 *FUN PROFILE SCORE*\n\n@${value} → *${score}/100*\n\n⚠️ Ye sirf username-based fun score hai; personality, fame ya identity ka analysis nahi.`, ...FAKE_FORWARD }, { quoted: message });
  }
};
