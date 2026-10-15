const CommandHandler = require('../../lib/commandHandler');
const settings = require('../../settings');
const { getChannelInfo } = require('../../lib/channelInfo');
const menuState = require('../../lib/menuState');

const SECURITY_CATEGORIES = new Set(['security']);

function realSecurityCommands(prefix) {
  return [...CommandHandler.commands.values()]
    .filter((cmd) => SECURITY_CATEGORIES.has(String(cmd.category || '').toLowerCase()))
    .filter((cmd) => cmd.command !== 'secmenu')
    .filter((cmd, index, all) => all.findIndex((item) => item.command === cmd.command) === index)
    .map((cmd) => `└ ⚡ ${prefix}${cmd.command}${cmd.usage && cmd.usage !== `.${cmd.command}` ? ` — ${cmd.description || ''}` : ''}`.trim());
}

module.exports = {
  command: 'secmenu',
  aliases: ['cybermenu', 'securitymenu', 'hackmenu', 'sec'],
  category: 'security',
  description: 'Shows the currently registered security tools',
  usage: `${settings.prefixes[0]}secmenu`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const commands = realSecurityCommands(prefix);

    const text = [
      `╭───「 🔐 *CYBER SECURITY MENU* 」`,
      `│ Live list from the command registry`,
      `│ Status: ${menuState.isMenuEnabled('secmenu') ? '🟢 ON' : '🔴 OFF'}`, 
      `╰───────────────○`,
      '',
      commands.length ? commands.join('\n') : '└ ⚠️ No security commands are currently registered.',
      '',
      `🏠 ${prefix}menu`,
      `📚 ${prefix}allmenu`,
      '',
      '💡 Only commands actually registered by the bot are shown.',
    ].join('\n');

    await sock.sendMessage(chatId, { text, contextInfo: getChannelInfo() }, { quoted: message });
  },
};
