const settings = require('../settings');
const { ownerNumbers, isOwnerOnly } = require('../lib/isOwner');

module.exports = {
  command: 'owners',
  aliases: ['ownerlist', 'listowners'],
  category: 'owner',
  ownerOnly: true,
  description: 'Show the configured primary and secondary owners',
  usage: `${settings.prefixes[0]}owners`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!isOwnerOnly(context.senderId)) {
      return sock.sendMessage(chatId, { text: '❌ Owner only command.' }, { quoted: message });
    }

    const numbers = ownerNumbers();
    const lines = numbers.map((number, index) =>
      `${index === 0 ? '👑 Primary Owner' : '🛡️ Secondary Owner'}: +${number}`
    );
    return sock.sendMessage(chatId, {
      text: `╭───「 👑 OWNERS 」───╮\n${lines.join('\n')}\n╰────────────────────╯`,
    }, { quoted: message });
  },
};
