const { getChannelInfo } = require('../../lib/channelInfo');
const { username } = require('../../lib/stalkTools');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'usernameinfo', aliases: ['handleinfo'], category: 'stalk', description: 'Inspect supplied username locally', usage: '.usernameinfo <username>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const raw = String(args[0] || '').replace(/^@/, '');
    const value = username(raw); const flags = [];
    if (!raw) flags.push('username missing'); if (raw.length < 2 || raw.length > 50) flags.push('length must be 2–50'); if (/\s/.test(raw)) flags.push('spaces are not allowed'); if (!/^[a-zA-Z0-9._-]+$/.test(raw)) flags.push('unsupported characters');
    const text = value ? `👤 *USERNAME INFO*\n\nHandle: @${value}\nLength: ${value.length}\n✅ Format looks valid\n\n⚠️ Availability/identity verify nahi ki gayi.` : `❌ Username invalid.\n${flags.map(f => `• ${f}`).join('\n') || '• format check failed'}`;
    return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
  }
};
