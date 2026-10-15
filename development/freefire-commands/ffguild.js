const { fetchInfo, basic, guild, field } = require('../../lib/freefire');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ffguild',
  aliases: ['ffclan', 'ffguildinfo'],
  category: 'freefire',
  description: 'Show a Free Fire player guild',
  usage: '.ffguild <uid>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!args[0]) return sock.sendMessage(chatId, { text: '❌ UID dein. Example: .ffguild 123456789' }, { quoted: message });
    try {
      const data = await fetchInfo(args[0]);
      const player = basic(data);
      const clan = guild(data);
      const text = `🛡️ *FREE FIRE GUILD*\n\n👤 Player: *${field(player.nickname)}*\n🆔 UID: ${field(player.accountId || player.uid)}\n🏷️ Guild: *${field(clan.clanName || clan.guildName, 'No guild')}*\n📊 Level: ${field(clan.clanLevel || clan.guildLevel)}\n👥 Members: ${field(clan.memberNum || clan.members)} / ${field(clan.capacity, 'N/A')}\n📝 Description: ${field(clan.clanDesc || clan.description, 'N/A')}`;
      return sock.sendMessage(chatId, { text, ...FAKE_FORWARD }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, { text: `🛡️ *FF Guild* → ${funnyError(error)}`, ...FAKE_FORWARD }, { quoted: message });
    }
  }
};