const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const { sendMenu2Style } = require('../lib/menuCarousel');

module.exports = {
  command: 'fbmenu',
  aliases: ['facebookmenu'],
  category: 'social',
  description: 'Facebook search command menu',
  usage: `${settings.prefixes[0]}fbmenu`,
  isPrefixless: true,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    return sendMenu2Style(sock, message, chatId, commandHandler, prefix, 'fbmenu');
  },
};