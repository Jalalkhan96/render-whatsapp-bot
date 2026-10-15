// Compatibility entry point for the original plugins/ tree.
// The actual menu implementation is centralized in lib/menuCarousel.js.
const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const { sendMenu2Style } = require('../lib/menuCarousel');

module.exports = {
  command: 'allmenu',
  aliases: ['menus', 'menulist', 'showmenus'],
  category: 'general',
  description: 'Open the complete menu carousel',
  usage: `${settings.prefixes[0]}allmenu`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const page = String(args[0] || '').toLowerCase() === 'page' ? Number(args[1]) : 1;
    return sendMenu2Style(sock, message, chatId, commandHandler, prefix);
  },
};
