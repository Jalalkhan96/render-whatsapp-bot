'use strict';

const { sendInteractiveMessage } = require('../lib/interactiveMenu');
const { categoryEntries, commandEntries } = require('./menu-engine');

function quickReply(label, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: label, id }),
  };
}

function categorySelector(entries) {
  const rows = entries.map((entry) => ({
    title: String(entry.title || entry.id).slice(0, 24),
    description: `${entry.commands.length} command${entry.commands.length === 1 ? '' : 's'}`.slice(0, 72),
    id: `menu_category:${entry.id}`,
  }));

  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title: '📂 CATEGORIES',
      sections: [{
        title: 'MYBOT MENUS',
        rows,
      }],
    }),
  };
}

function mainText(botName, prefix, entries) {
  const lines = [
    `╭━━━〔 🤖 ${botName} 〕━━━╮`,
    '┃',
    '┃ 📚 *COMMAND CENTER*',
    '┃ Choose a menu using the buttons',
    '┃ or the scrollable category list.',
    '┃',
    `┃ 📦 Menus: *${entries.length}*`,
    `┃ ⚡ Prefix: *${prefix}*`,
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
  ];
  return lines.join('\n');
}

async function sendMainMenu(sock, message, chatId, commandHandler, prefix, viewer, botName = 'myBOT') {
  const entries = categoryEntries(commandHandler, viewer);
  const buttons = [
    quickReply('📋 ALL MENU', 'menu_all'),
    quickReply('👥 GROUP', 'menu_group'),
    categorySelector(entries),
  ];

  const body = mainText(botName, prefix, entries);

  return sendInteractiveMessage(sock, chatId, {
    body,
    footer: `${botName} • Select a category`,
    buttons,
  }, {
    quoted: message,
    nativeInteractive: true,
    fakeForward: false,
  });
}

async function sendCategoryMenu(sock, message, chatId, commandHandler, prefix, category, viewer, botName = 'myBOT') {
  const commands = commandEntries(commandHandler, category, viewer);
  if (!commands.length) {
    return sock.sendMessage(chatId, {
      text: `No available commands in ${category}.\n\n${prefix}menu`,
      contextInfo: {},
    }, { quoted: message });
  }

  const lines = [
    `╭━━━〔 ${botName} ${String(category).toUpperCase()} 〕━━━╮`,
    '┃',
    ...commands.map((command) =>
      `┃ ${prefix}${command.command}${command.description ? ` — ${command.description}` : ''}`
    ),
    '┃',
    `┃ 🏠 ${prefix}menu`,
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
  ];

  return sendInteractiveMessage(sock, chatId, {
    body: lines.join('\n'),
    footer: `${botName} • ${String(category).toUpperCase()}`,
    buttons: [
      quickReply('🏠 HOME', `${prefix}menu`),
      quickReply('📋 ALL', `${prefix}allmenu`),
    ],
  }, {
    quoted: message,
    nativeInteractive: true,
    fakeForward: false,
  });
}

async function sendAllMenu(sock, message, chatId, commandHandler, prefix, viewer, botName = 'myBOT') {
  const entries = categoryEntries(commandHandler, viewer);
  const rows = entries.map((entry) => ({
    title: String(entry.title || entry.id).slice(0, 24),
    description: `${entry.commands.length} command${entry.commands.length === 1 ? '' : 's'}`.slice(0, 72),
    id: `menu_category:${entry.id}`,
  }));

  return sendInteractiveMessage(sock, chatId, {
    body: `📚 *${botName} — ALL MENUS*\n\nScroll the list and select a category.\n\n📦 Total: *${entries.length}*`,
    footer: `${botName} • All menus`,
    buttons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: '📂 SELECT MENU',
          sections: [{ title: 'ALL CATEGORIES', rows }],
        }),
      },
      quickReply('🏠 HOME', `${prefix}menu`),
    ],
  }, {
    quoted: message,
    nativeInteractive: true,
    fakeForward: false,
  });
}

module.exports = { sendMainMenu, sendCategoryMenu, sendAllMenu };
