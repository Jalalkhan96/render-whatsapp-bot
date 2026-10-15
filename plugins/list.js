 const settings = require('../settings');
 const commandHandler = require('../lib/commandHandler');
 const { getChannelInfo } = require('../lib/channelInfo');
const { isOwnerOnlyAsync } = require('../lib/isOwner');
const {
  sendMainMenu,
  sendCategoryMenu,
  sendAllCommandFlow,
  sendOnlyMenu,
  sendMenu2Style,
  sendMenuCarousel,
  sendMenuPageFromInteraction,
  sendCategoryCommandList,
} = require('../lib/menuCarousel');

const categoryIcons = {
  general: '⚙️', owner: '👑', admin: '🛡️', group: '👥', utility: '🧰',
  media: '🎬', ai: '🤖', download: '📥', search: '🔎', fun: '🎉',
  tools: '🔧', game: '🎮',
};

function uniqueCommands() {
  return [...commandHandler.commands.values()].filter((command, index, list) =>
    list.findIndex((item) => item.command === command.command) === index
  );
}

function categoryRows() {
  return [...commandHandler.categories.entries()]
    .filter(([, commands]) => commands.length)
    .map(([category, commands]) => ({
      title: `${categoryIcons[category] || '📁'} ${category.toUpperCase()}`,
      description: `${commands.length} command${commands.length === 1 ? '' : 's'}`,
      id: `menu_${category}`,
    }));
}

function categoryText(category, prefix) {
  const commands = commandHandler.categories.get(category) || [];
  if (!commands.length) return `❌ No commands found in *${category}*.`;
  return [
    `✦ *${settings.botName || 'ABIX-AE'} • ${categoryIcons[category] || '📁'} ${category.toUpperCase()}* ✦`,
    '',
    ...commands.map((name, index) => `${String(index + 1).padStart(2, '0')} › *${prefix}${name}*`),
    '',
    `Use *${prefix}menu* to return to the main menu.`,
  ].join('\n');
}

module.exports = {
  command: 'menu',
  aliases: ['help', 'commands', 'h', 'list'],
  category: 'general',
  description: 'Open the ABIX-AE interactive command menu',
  usage: '-menu [category|all|command]',
  isPrefixless: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = settings.prefixes[0] || '-';
    const viewerIsOwner = Boolean(context.isOwnerOnly || await isOwnerOnlyAsync(context.senderId, sock, chatId));
    const wanted = String(args[0] || '').toLowerCase();

    if (!wanted || wanted === 'categories') {
      return wanted === 'categories'
        ? sendCategoryMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner)
        : sendMainMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner);
    }

    if (wanted === 'onlymenu') return sendOnlyMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner);
    if (wanted === 'all') return sendAllCommandFlow(sock, message, chatId, commandHandler, prefix, viewerIsOwner);
    if (wanted === 'page') {
      const page = Number(args[1]);
      return sendMenuPageFromInteraction(sock, message, chatId, commandHandler, prefix, page);
    }

    const menuCommand = commandHandler.commands.get(wanted);
    if (menuCommand?.command?.endsWith('menu')) {
      const category = wanted === 'gcmenu' ? 'group' : wanted.replace(/menu$/i, '');
      return sendMenu2Style(sock, message, chatId, commandHandler, prefix, category, viewerIsOwner);
    }

    if (commandHandler.categories.has(wanted)) {
      return sendMenu2Style(sock, message, chatId, commandHandler, prefix, wanted, viewerIsOwner);
    }

    const command = commandHandler.commands.get(wanted) ||
      commandHandler.commands.get(commandHandler.aliases.get(wanted));
    if (!command || (!viewerIsOwner && (command.ownerOnly === true || String(command.ownerOnly).toLowerCase() === 'true' || command.strictOwnerOnly || String(command.category || '').toLowerCase() === 'owner'))) {
      return sock.sendMessage(chatId, {
        text: `❌ Command *${wanted}* not found.\n\nUse *${prefix}menu* to open the interactive menu.`,
        ...getChannelInfo(),
      }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
      text: `╭━━━〔 *COMMAND INFO* 〕━━━╮\n┃ ⚡ ${prefix}${command.command}\n┃ 📝 ${command.description || 'No description'}\n┃ 📖 ${command.usage || `${prefix}${command.command}`}\n╰━━━━━━━━━━━━━━━━━━━━━━╯`,
      ...getChannelInfo(),
    }, { quoted: message });
  },
};
