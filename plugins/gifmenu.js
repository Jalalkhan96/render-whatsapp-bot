'use strict';

const settings = require('../settings');
function prefix() { return settings.prefixes?.[0] || '-'; }

module.exports = {
  command: 'gifmenu',
  aliases: ['gifm', 'gmen'],
  category: 'menu',
  description: 'Show the GIPHY GIF, Sticker and Clip menu.',
  usage: `${prefix()}gifmenu`,

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const p = prefix();
    const menu = [
      '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
      '┃    🎞️  𝗚𝗜𝗣𝗛𝗬 𝗠𝗘𝗡𝗨  🎞️        ┃',
      '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
      '',
      '╭─[ 🎬 𝗚𝗜𝗙 ]───────────────',
      `│  🌀  ${p}gif <name>`,
      `│  🔢  ${p}gif <n> <name>`,
      `│  🎲  ${p}gif random`,
      '╰────────────────────────────',
      '',
      '╭─[ 🎴 𝗦𝗧𝗜𝗖𝗞𝗘𝗥 ]──────────',
      `│  🧩  ${p}gifs <name>`,
      `│  🔢  ${p}gifs <n> <name>`,
      '╰────────────────────────────',
      '',
      '╭─[ 🎥 𝗖𝗟𝗜𝗣 ]─────────────',
      `│  🎬  ${p}gifc <name>`,
      `│  🔢  ${p}gifc <n> <name>`,
      `│  🎲  ${p}gifc random <n>`,
      '╰────────────────────────────',
      '',
      '⚡ 𝗧𝗘𝗔𝗠𝗔𝗕𝗜𝗫',
    ].join('\n');
    return sock.sendMessage(chatId, { text: menu }, { quoted: message });
  },
};
