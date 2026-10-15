const { getChannelInfo } = require('../../lib/channelInfo');
const FAKE_FORWARD = getChannelInfo();
module.exports = { command: 'usernamegen', aliases: ['usergen'], category: 'stalk', description: 'Generate username ideas locally', usage: '.usernamegen <name>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid; const base = args.join('').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    if (!base) return sock.sendMessage(chatId, { text: '⚡ Name do. Example: .usernamegen Jalal', ...FAKE_FORWARD }, { quoted: message });
    const ideas = [...new Set([base, `${base}Official`, `${base}_ae`, `${base}.x`, `The${base}`, `${base}Live`, `${base}Hub`, `${base}Pk`])];
    return sock.sendMessage(chatId, { text: `✨ *USERNAME IDEAS*\n\n${ideas.map((x, i) => `${i + 1}. \`${x}\``).join('\n')}\n\n⚠️ Availability verify nahi ki gayi.`, ...FAKE_FORWARD }, { quoted: message });
  }
};
