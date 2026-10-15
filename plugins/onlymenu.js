const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const menuCarousel = require('../lib/menuCarousel');
const { buildBotTopMessage } = require('../lib/menuMedia');

async function sendOnlyMenuCompat(sock, message, chatId, prefix) {
  const entries = [...commandHandler.commands.values()]
    .map(command => String(command?.command || '').toLowerCase())
    .filter(command => command.endsWith('menu') && command !== 'allmenu' && command !== 'onlymenu')
    .filter((command, index, list) => list.indexOf(command) === index)
    .sort();
  const text = [
    '╭───「 📚 *ABIX-AE MENU LIST* 」',
    `│ 📊 *Total Menus:* ${entries.length}`,
    '╰───────────────○',
    '',
    ...entries.map((command, index) => `${index === entries.length - 1 ? '└' : '├'}─ ⚡ ${prefix}${command}`),
  ].join('\n');
  const content = buildBotTopMessage(text, { _skipMenuCard: true });
  return sock.sendMessage(chatId, content, { quoted: message });
}

module.exports = {
  command: 'onlymenu',
  aliases: ['listmenus'],
  category: 'general',
  description: 'Show menu modules only without internal commands',
  usage: `${settings.prefixes[0]}onlymenu`,
  isPrefixless: true,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const sendOnlyMenu = typeof menuCarousel.sendOnlyMenu === 'function'
      ? menuCarousel.sendOnlyMenu
      : sendOnlyMenuCompat;
    return sendOnlyMenu(sock, message, chatId, commandHandler, prefix);
  },
};