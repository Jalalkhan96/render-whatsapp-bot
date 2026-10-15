const { fetchInfo, basic, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffcareer',
  aliases: ['ffstats', 'ffcareerinfo'],
  category: 'freefire',
  description: 'Show Free Fire rank and account career stats',
  usage: '.ffcareer <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!args[0]) return sock.sendMessage(chatId, { text: '❌ UID dein. Example: .ffcareer 123456789' }, { quoted: message });
    try {
      const data = await fetchInfo(args[0]);
      const player = basic(data);
      const text = `📊 *FREE FIRE CAREER*\n\n👤 ${field(player.nickname)} (${field(player.accountId || player.uid)})\n🎚️ Level: ${field(player.level)}\n✨ EXP: ${field(player.exp)}\n🏆 BR Points: ${field(player.rankingPoints)}\n⚔️ CS Points: ${field(player.csRankingPoints)}\n🎖️ Badges: ${field(player.badgeCnt)}\n⭐ Honor: ${field(player.honorScore)}\n📅 Created: ${field(player.createAt)}\n🕒 Last Login: ${field(player.lastLoginAt)}`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `📊 *FF Career* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};