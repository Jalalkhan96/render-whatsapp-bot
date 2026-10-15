const CommandHandler = require('../lib/commandHandler');
const settings = require("../settings");
const { sendMenu2Style } = require('../lib/menuCarousel');

module.exports = {
  command: 'menu2',
  aliases: ['plugins2', 'newmenu'],
  category: 'general',
  description: 'Shows only the newly added commands from plugins2',
  usage: `${settings.prefixes[0]}menu2`,
  isPrefixless: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    return sendMenu2Style(sock, message, chatId, CommandHandler, context.prefix || settings.prefixes[0] || '-');
  }
};
