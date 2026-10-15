'use strict';

const { isWelcomeOn, isGoodByeOn, getWelcome, getGoodbye, addWelcome, addGoodbye } = require('../lib/index');
const {
  getWelcomeStyleConfig,
  setWelcomeStyleConfig,
  styleListText,
  configureWelcomeing,
} = require('../lib/welcomeStyles');

module.exports = {
  command: 'welcomeing',
  aliases: ['welcoming', 'welcomeingmenu', 'welcomeevent'],
  category: 'admin',
  description: 'Configure styled welcome and leave messages',
  usage: '-welcomeing [on|off|welcome on|leave on|style N|welcome-style N|leave-style N|set ...|leave-set ...|status]',
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const tokens = Array.isArray(args) ? args.map(String) : [];
    const first = String(tokens[0] || '').toLowerCase();
    const second = String(tokens[1] || '').toLowerCase();

    if (!tokens.length || first === 'help' || first === 'menu') {
      return sock.sendMessage(chatId, {
        text: [
          '╭━━━〔 🌸 WELCOMEING 〕━━━╮',
          '┃',
          '┃ -welcomeing on',
          '┃ -welcomeing off',
          '┃ -welcomeing welcome on|off',
          '┃ -welcomeing leave on|off',
          '┃ -welcomeing style 1-5',
          '┃ -welcomeing welcome-style 1-5',
          '┃ -welcomeing leave-style 1-5',
          '┃ -welcomeing set <message>',
          '┃ -welcomeing leave-set <message>',
          '┃ -welcomeing status',
          '┃',
          styleListText().split('\n').join('\n┃ '),
          '╰━━━━━━━━━━━━━━━━━━━━━━╯',
        ].join('\n'),
      }, { quoted: message });
    }

    if (['on', 'off'].includes(first)) {
      const result = await configureWelcomeing(chatId, first);
      return sock.sendMessage(chatId, { text: result.message }, { quoted: message });
    }

    if (['welcome', 'join', 'leave', 'goodbye'].includes(first)) {
      if (['on', 'off'].includes(second)) {
        const target = first === 'join' ? 'welcome' : first === 'goodbye' ? 'leave' : first;
        const result = await configureWelcomeing(chatId, target, second);
        return sock.sendMessage(chatId, { text: result.message }, { quoted: message });
      }
      if (first === 'welcome' && second === 'style') {
        const n = Number(tokens[2]);
        const config = await setWelcomeStyleConfig(chatId, { welcomeStyle: n });
        return sock.sendMessage(chatId, { text: `✅ Welcome style set to *${config.welcomeStyle}*.` }, { quoted: message });
      }
      if ((first === 'leave' || first === 'goodbye') && second === 'style') {
        const n = Number(tokens[2]);
        const config = await setWelcomeStyleConfig(chatId, { goodbyeStyle: n });
        return sock.sendMessage(chatId, { text: `✅ Leave style set to *${config.goodbyeStyle}*.` }, { quoted: message });
      }
    }

    if (first === 'style') {
      const n = Number(tokens[1]);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return sock.sendMessage(chatId, { text: `${styleListText()}\n\nExample: -welcomeing style 3` }, { quoted: message });
      }
      const config = await setWelcomeStyleConfig(chatId, { welcomeStyle: n, goodbyeStyle: n });
      return sock.sendMessage(chatId, { text: `✅ Welcome style: *${config.welcomeStyle}*\n✅ Leave style: *${config.goodbyeStyle}*` }, { quoted: message });
    }

    if (first === 'welcome-style' || first === 'welcomestyle') {
      const n = Number(tokens[1]);
      if (!Number.isInteger(n) || n < 1 || n > 5) return sock.sendMessage(chatId, { text: styleListText() }, { quoted: message });
      const config = await setWelcomeStyleConfig(chatId, { welcomeStyle: n });
      return sock.sendMessage(chatId, { text: `✅ Welcome style set to *${config.welcomeStyle}*.` }, { quoted: message });
    }

    if (first === 'leave-style' || first === 'leavestyle' || first === 'goodbye-style' || first === 'goodbyestyle') {
      const n = Number(tokens[1]);
      if (!Number.isInteger(n) || n < 1 || n > 5) return sock.sendMessage(chatId, { text: styleListText() }, { quoted: message });
      const config = await setWelcomeStyleConfig(chatId, { goodbyeStyle: n });
      return sock.sendMessage(chatId, { text: `✅ Leave style set to *${config.goodbyeStyle}*.` }, { quoted: message });
    }

    if (first === 'set' || first === 'welcome-set') {
      const custom = tokens.slice(1).join(' ').trim();
      if (!custom) return sock.sendMessage(chatId, { text: '❌ Usage: -welcomeing set Welcome {user} to {group}' }, { quoted: message });
      await addWelcome(chatId, true, custom);
      return sock.sendMessage(chatId, { text: '✅ Custom welcome message saved.' }, { quoted: message });
    }

    if (first === 'leave-set' || first === 'goodbye-set') {
      const custom = tokens.slice(1).join(' ').trim();
      if (!custom) return sock.sendMessage(chatId, { text: '❌ Usage: -welcomeing leave-set Goodbye {user} from {group}' }, { quoted: message });
      await addGoodbye(chatId, true, custom);
      return sock.sendMessage(chatId, { text: '✅ Custom leave message saved.' }, { quoted: message });
    }

    if (first === 'reset') {
      await addWelcome(chatId, true, null);
      await addGoodbye(chatId, true, null);
      const config = await setWelcomeStyleConfig(chatId, { welcomeStyle: 1, goodbyeStyle: 1 });
      return sock.sendMessage(chatId, { text: `✅ Welcome/leave reset.\nWelcome style: ${config.welcomeStyle}\nLeave style: ${config.goodbyeStyle}` }, { quoted: message });
    }

    if (first === 'status') {
      const cfg = await getWelcomeStyleConfig(chatId);
      const welcomeOn = Boolean(await isWelcomeOn(chatId));
      const goodbyeOn = Boolean(await isGoodByeOn(chatId));
      const welcomeCustom = Boolean(await getWelcome(chatId));
      const goodbyeCustom = Boolean(await getGoodbye(chatId));
      return sock.sendMessage(chatId, {
        text: [
          '╭━━━〔 ⚙️ WELCOME STATUS 〕━━━╮',
          `┃ Welcome: ${welcomeOn ? '✅ ON' : '❌ OFF'}`,
          `┃ Leave  : ${goodbyeOn ? '✅ ON' : '❌ OFF'}`,
          `┃ Welcome style: *${cfg.welcomeStyle}*`,
          `┃ Leave style: *${cfg.goodbyeStyle}*`,
          `┃ Welcome custom: ${welcomeCustom ? '✅' : '❌ (styled default)'}`,
          `┃ Leave custom: ${goodbyeCustom ? '✅' : '❌ (styled default)'}`,
          '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        ].join('\n'),
      }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
      text: `❌ Unknown option. Use *-welcomeing* to view the setup menu.`,
    }, { quoted: message });
  },
};
