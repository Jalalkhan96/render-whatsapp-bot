const { fetchInfo, basic, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffcompare',
  aliases: ['compareff', 'ffvs'],
  category: 'freefire',
  description: 'Compare two Free Fire profiles',
  usage: '.ffcompare <uid1> <uid2>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!args[0] || !args[1]) return sock.sendMessage(chatId, { text: '❌ 2 UIDs dein. Example: .ffcompare 123456789 987654321' }, { quoted: message });
    try {
      const [first, second] = await Promise.all([fetchInfo(args[0]), fetchInfo(args[1])]);
      const a = basic(first);
      const b = basic(second);
      const value = (item, key) => Number(item[key] || 0);
      const winner = (key) => value(a, key) === value(b, key) ? 'Tie' : value(a, key) > value(b, key) ? field(a.nickname, 'Player 1') : field(b.nickname, 'Player 2');
      const text = `⚔️ *FREE FIRE COMPARISON*\n\n👤 *${field(a.nickname, 'Player 1')}* vs *${field(b.nickname, 'Player 2')}*\n\n🎚️ Level: ${field(a.level)} vs ${field(b.level)}\n🏆 BR: ${field(a.rankingPoints)} vs ${field(b.rankingPoints)}\n⚔️ CS: ${field(a.csRankingPoints)} vs ${field(b.csRankingPoints)}\n❤️ Likes: ${field(a.liked)} vs ${field(b.liked)}\n\n🏅 BR winner: *${winner('rankingPoints')}*`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `⚔️ *FF Compare* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};