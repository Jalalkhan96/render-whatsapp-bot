const CommandHandler = require('../lib/commandHandler');
const settings = require('../settings');
const { useNativeInteractive, sendMainMenuButtons } = require('../lib/interactiveMenu');

const MENU_PAGE_SIZE = 18;
const { getBotTopMedia, buildBotTopMessage } = require('../lib/menuMedia');

function getGroupAdminCommands() {
  return [...CommandHandler.commands.values()]
    .filter((cmd) => cmd.command !== 'gcmenu')
    .filter((cmd) => cmd.category === 'admin' || cmd.category === 'group' || cmd.adminOnly || cmd.groupOnly)
    .filter((cmd, index, all) => all.findIndex((item) => item.command === cmd.command) === index)
    .map((cmd) => ({ command: String(cmd.command).trim() }))
    .filter((cmd) => cmd.command)
    .sort((a, b) => a.command.localeCompare(b.command));
}

function makeButton(display_text, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text, id }),
  };
}

function buildBody(commands, prefix, page, totalPages) {
  const start = (page - 1) * MENU_PAGE_SIZE;
  const visible = commands.slice(start, start + MENU_PAGE_SIZE);

  const lines = [
    '╭━━━〔 🛡️ *ABIX-AE GROUP MENU* 〕━━━╮',
    `┃ 📦 ${commands.length} commands`,
    `┃ 📄 Page ${page}/${totalPages}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '┏━━〔 ⚡ GROUP TOOLS 〕━━┓',
  ];

  visible.forEach((item, index) => {
    const number = String(start + index + 1).padStart(2, '0');
    lines.push(`┃ ${number} • ${prefix}${item.command}`);
  });

  lines.push('┗━━━━━━━━━━━━━━━━━━━━━━━┛');
  return lines.join('\n');
}

function buildButtons(prefix, page, totalPages) {
  const buttons = [];

  if (page > 1) {
    buttons.push(makeButton('⬅️ BACK', `${prefix}gcmenu page ${page - 1}`));
  }

  buttons.push(makeButton('🏠 MAIN MENU', `${prefix}menu`));
  buttons.push(makeButton('📚 ALL MENU', `${prefix}allmenu`));

  if (page < totalPages && buttons.length < 3) {
    buttons.push(makeButton('➡️ NEXT', `${prefix}gcmenu page ${page + 1}`));
  } else if (page < totalPages) {
    buttons[2] = makeButton('➡️ NEXT', `${prefix}gcmenu page ${page + 1}`);
  }

  return buttons.slice(0, 3);
}

module.exports = {
  command: 'gcmenu',
  aliases: ['gc', 'groupmenu', 'adminmenu'],
  category: 'general',
  description: 'Group administration menu',
  usage: `${settings.prefixes[0]}gcmenu`,
  isPrefixless: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const commands = getGroupAdminCommands();

    const requestedPage = String(args?.[0] || '').toLowerCase() === 'page'
      ? Number.parseInt(args?.[1], 10)
      : Number.parseInt(args?.[0], 10);

    const totalPages = Math.max(1, Math.ceil(commands.length / MENU_PAGE_SIZE));
    const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
    const body = buildBody(commands, prefix, page, totalPages);
    const buttons = buildButtons(prefix, page, totalPages);

    try {
      const media = getBotTopMedia();
      if (media) {
        await sock.sendMessage(chatId, { ...buildBotTopMessage(body), _skipMenuCard: true }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: body, contextInfo: {}, _skipMenuCard: true }, { quoted: message });
      }

      // Reuse the menu's existing page controls. On clients where the native
      // controls are unavailable, sendMainMenuButtons falls back to command text.
      if (useNativeInteractive()) {
        const actionButtons = buttons.map((button) => {
          let parsed = {};
          try { parsed = JSON.parse(button.buttonParamsJson); } catch {}
          return {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: parsed.display_text || 'OPEN',
              id: parsed.id || `${prefix}gcmenu`,
            }),
          };
        });
        return sendMainMenuButtons(sock, chatId, {
          title: '🛡️ ABIX-AE • GROUP MENU',
          footer: 'TEAM ABIX',
          quoted: message,
          prefix,
          buttons: actionButtons,
        });
      }
      return null;
    } catch (error) {
      console.error('[GCMENU]', error);
      return sock.sendMessage(chatId, { text: body, contextInfo: {}, _skipMenuCard: true }, { quoted: message });
    }
  },
};
