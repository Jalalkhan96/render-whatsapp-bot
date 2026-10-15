const settings = require('../settings');
const { setPrefix } = require('../lib/prefix');
const { isOwnerOnly } = require('../lib/isOwner');

module.exports = {
  command: 'setprefix',
  aliases: [],
  category: 'owner',
  ownerOnly: true,
  strictOwnerOnly: true,
  description: 'Change the ABIX command prefix',
  usage: `${settings.prefixes[0]}setprefix <prefix>`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (!isOwnerOnly(context.senderId)) {
      return sock.sendMessage(chatId, { text: '❌ Owner only command.' }, { quoted: message });
    }
    try {
      const prefix = setPrefix(args[0]);
      settings.prefixes.splice(0, settings.prefixes.length, prefix);
      return sock.sendMessage(chatId, {
        text: `✅ Prefix updated.\n\nNew prefix:\n${prefix}\n\nExample:\n${prefix}menu\n${prefix}help\n${prefix}allmenu`,
      }, { quoted: message });
    } catch (error) {
      return sock.sendMessage(chatId, {
        text: `❌ ${error.message}\n\nExample: ${settings.prefixes[0]}setprefix §`,
      }, { quoted: message });
    }
  },
};
