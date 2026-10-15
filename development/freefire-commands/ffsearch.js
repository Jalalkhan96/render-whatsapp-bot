const { getChannelInfo } = require('../../lib/channelInfo');
const { searchPlayers, field } = require('../../lib/freefire');
const store = require('../../lib/ffStore');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffsearch',
  aliases: ['ffplayersearch', 'searchff'],
  category: 'freefire',
  description: 'Search Free Fire players by name/keyword',
  usage: '.ffsearch <name> [server]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const keyword = args[0];
    const server = args[1] || 'IND';
    if (!keyword) {
      return sock.sendMessage(chatId, { text: '❌ Name dein. Example: .ffsearch LKTEAM IND' }, { quoted: message });
    }
    try {
      await sock.sendMessage(chatId, { react: { text: '🔎', key: message.key } });
      const results = await searchPlayers(keyword, server);
      if (!results || !results.length) {
        return sock.sendMessage(chatId, { text: `🔎 *FF Search* → ${funnyError('no results')}`, ...FAKE_FORWARD }, { quoted: message });
      }
      const lines = results.slice(0, 10).map((p, i) => {
        const name = field(p.nickname || p.nicknameV2 || p.accountName, 'Unknown');
        const id = field(p.accountid || p.accountId || p.uid, '?');
        const lvl = field(p.level, '?');
        return `${i + 1}. *${name}*\n   🆔 ${id} | 🎚️ L${lvl} | 🌍 ${field(p.region, server.toUpperCase())}`;
      }).join('\n\n');
      const text = `🔎 *FREE FIRE PLAYER SEARCH*\n\nKeyword: *${keyword}*\nServer: ${server.toUpperCase()}\n\n${lines}\n\n_Tap \`.ffinfo <uid>\` for full profile._`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `🔎 *FF Search* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};