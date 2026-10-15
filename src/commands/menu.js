import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendInteractiveMessage, sendPlainFallback } from '../whatsapp-ui/interactive.js';
import { CATEGORIES, getCommandsByCategory, getTotalCommandCount } from './catalog.js';
import { config } from '../config.js';

/*
 * native carousel menu flow adapted for ABIX-AE.
 *
 * 1. $menu               -> compact main menu + 3 buttons
 * 2. $menu categories    -> category picker
 * 3. $menu all           -> complete command flow
 * 4. $menu <category>    -> commands for one category
 *
 * The active ABIX prefix is always respected; this build does not hard-code
 * "$" so existing installations using "-" or another configured prefix keep
 * working.
 */

function commandPrefix(prefix = config.bot.prefix || '$') {
  return String(prefix || '$');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_TOP_VIDEO = path.join(__dirname, '../../assets/bot_top.mp4');

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter(([name]) => {
    const key = String(name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCategoryRows(prefix) {
  return CATEGORIES
    .map(([key, icon, title]) => {
      const commands = uniqueCommands(getCommandsByCategory(key));
      if (!commands.length) return null;
      return {
        title: `${icon} ${title}`,
        description: `${commands.length} command${commands.length === 1 ? '' : 's'}`,
        id: `menu_${key}`,
      };
    })
    .filter(Boolean);
}

function mainBody(botName, prefix) {
  return [
    `✦ *${botName}* ✦`,
    '',
    '⚡ Status : *ONLINE*',
    `🔑 Prefix : *${prefix}*`,
    `📦 Commands : *${getTotalCommandCount()}*`,
    '',
    `${botName} is your all-in-one`,
    'WhatsApp command center.',
    '',
    'Choose an option below.',
  ].join('\n');
}

function categoryBody(category, prefix, botName) {
  const entry = CATEGORIES.find(([key]) => key === category);
  if (!entry) return null;

  const [, icon, title] = entry;
  const commands = uniqueCommands(getCommandsByCategory(category));

  if (!commands.length) {
    return [
      `✦ *${botName} • ${icon} ${title}* ✦`,
      '',
      '❌ No commands are registered in this category.',
      '',
      `Use *${prefix}menu categories* to choose another section.`,
    ].join('\n');
  }

  const lines = [
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    ` *${botName}*`,
    ` ${title} FLOW`,
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    '',
  ];

  commands.forEach(([name, description], index) => {
    const number = String(index + 1).padStart(2, '0');
    lines.push(`${number} › *${prefix}${name}*`);
    lines.push(` ${description || 'No description available.'}`);
    lines.push('');
  });

  lines.push(
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    '',
    `Use *${prefix}menu* to return to the ${botName} command center.`
  );

  return lines.join('\n');
}

function allCommandBody(prefix, botName) {
  const grouped = new Map();

  for (const [name, description, category] of CATEGORIES.flatMap(([key]) =>
    getCommandsByCategory(key).map(([cmd, desc]) => [cmd, desc, key])
  )) {
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push([name, description]);
  }

  const lines = [
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    ` *${botName}*`,
    ' COMMAND FLOW',
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    '',
    '⚡ Status : *ONLINE*',
    `🔑 Prefix : *${prefix}*`,
    `📦 Commands : *${getTotalCommandCount()}*`,
  ];

  for (const [category, commands] of grouped) {
    const entry = CATEGORIES.find(([key]) => key === category);
    const icon = entry?.[1] || '📁';
    const title = entry?.[2] || category.toUpperCase();

    lines.push('', `${icon} *${title}*`, '────────────────────');
    uniqueCommands(commands).forEach(([name, description], index) => {
      const number = String(index + 1).padStart(2, '0');
      lines.push(`${number} › *${prefix}${name}*`);
      lines.push(` ${description || 'No description available.'}`);
      if (index !== commands.length - 1) lines.push('');
    });
  }

  lines.push(
    '',
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    '',
    `Use *${prefix}menu* to return to the ${botName} command center.`
  );

  return lines.join('\n');
}

async function sendMainMenu({ sock, jid, msg, prefix, botName }) {
  const buttons = [
    { display_text: '📋 MENU', id: 'menu_categories' },
    { display_text: '📚 ALL MENU', id: 'menu_all' },
    { display_text: '👥 GROUP', id: 'menu_group' },
  ];

  const body = mainBody(botName, prefix);
  const menuVideoExists = fs.existsSync(BOT_TOP_VIDEO);

  // The ABIX main menu uses the existing assets/bot_top.mp4.
  // Do not rely on menu.jpg or the configurable image-media store here.
  try {
    if (menuVideoExists) {
      await sock.sendMessage(
        jid,
        {
          video: fs.readFileSync(BOT_TOP_VIDEO),
          gifPlayback: true,
          caption: body,
          _skipMenuCard: true,
        },
        { quoted: msg }
      );

      // Keep the interactive native carousel controls immediately after the video.
      try {
        const nativeButtons = buttons.map((button) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify(button),
        }));

        await sendInteractiveMessage(sock, jid, {
          interactiveMessage: {
            header: {
              title: `✦ ${botName} ✦`,
              subtitle: 'WhatsApp Command Center',
              hasMediaAttachment: false,
            },
            body: {
              text: 'Choose an option below.',
            },
            footer: {
              text: `${botName} • Select a menu`,
            },
            nativeFlowMessage: {
              buttons: nativeButtons,
              messageParamsJson: '',
            },
          },
        }, { quoted: msg });
      } catch (buttonError) {
        console.warn('[MENU] Interactive controls unavailable:', buttonError.message);
        await sendPlainFallback(
          sock,
          jid,
          `📋 ${prefix}menu categories\n📚 ${prefix}menu all\n👥 ${prefix}menu group`,
          { quoted: msg }
        );
      }

      return null;
    }

    // If bot_top.mp4 is missing, retain the menu controls as a safe fallback.
    const nativeButtons = buttons.map((button) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify(button),
    }));

    await sendInteractiveMessage(sock, jid, {
      interactiveMessage: {
        header: {
          title: `✦ ${botName} ✦`,
          subtitle: 'WhatsApp Command Center',
          hasMediaAttachment: false,
        },
        body: { text: body },
        footer: { text: `${botName} • Select a menu` },
        nativeFlowMessage: {
          buttons: nativeButtons,
          messageParamsJson: '',
        },
      },
    }, { quoted: msg });
  } catch (error) {
    const fallback = [
      body,
      '',
      `📋 ${prefix}menu categories`,
      `📚 ${prefix}menu all`,
      `👥 ${prefix}menu group`,
    ].join('\n');

    await sendPlainFallback(sock, jid, fallback, { quoted: msg });
  }

  return null;
}
async function sendCategoryPicker({ sock, jid, msg, prefix, botName }) {
  const rows = getCategoryRows(prefix);
  const buttons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: '📂 OPEN MENU',
        sections: [{ title: `${botName} MODULES`, rows }],
      }),
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: '🏠 MAIN', id: 'menu_main' }),
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: '📚 ALL', id: 'menu_all' }),
    },
  ];

  const body = `✦ *${botName} COMMAND MENU* ✦\n\nSelect the section you need.`;

  try {
    await sendInteractiveMessage(sock, jid, {
      interactiveMessage: {
        header: {
          title: `✦ ${botName} ✦`,
          subtitle: 'Command Categories',
          hasMediaAttachment: false,
        },
        body: { text: body },
        footer: { text: `${botName} • Command Center` },
        nativeFlowMessage: {
          buttons,
          messageParamsJson: '',
        },
      },
    }, { quoted: msg });
    return null;
  } catch {
    const fallback = [
      body,
      '',
      ...rows.map(row => `${row.title}\n${row.description}\n→ ${prefix}menu ${row.id.slice(5)}`),
      '',
      `🏠 ${prefix}menu`,
      `📚 ${prefix}menu all`,
    ].join('\n\n');
    await sendPlainFallback(sock, jid, fallback, { quoted: msg });
    return null;
  }
}

export async function sendMenu(ctx) {
  const {
    sock,
    prefix: rawPrefix = config.bot.prefix || '$',
    botName = config.bot.name || 'ABIX-AE',
    msg = null,
    section = '',
  } = ctx;

  const prefix = commandPrefix(rawPrefix);
  const jid = ctx.jid || ctx.from;
  const wanted = String(section || '').trim().toLowerCase();

  try {
    if (!wanted) {
      return sendMainMenu({ sock, jid, msg, prefix, botName });
    }

    if (wanted === 'categories') {
      return sendCategoryPicker({ sock, jid, msg, prefix, botName });
    }

    if (wanted === 'all') {
      return sendPlainFallback(sock, jid, allCommandBody(prefix, botName), { quoted: msg });
    }

    if (wanted === 'group') {
      return sendPlainFallback(sock, jid, categoryBody('group', prefix, botName), { quoted: msg });
    }

    const body = categoryBody(wanted, prefix, botName);
    if (body) {
      return sendPlainFallback(sock, jid, body, { quoted: msg });
    }

    return sendPlainFallback(sock, jid, [
      '❌ Unknown menu.',
      '',
      `Use *${prefix}menu*`,
      `Use *${prefix}menu categories*`,
      `Use *${prefix}menu all*`,
      `Use *${prefix}menu group*`,
    ].join('\n'), { quoted: msg });
  } catch (err) {
    const fallback = [
      mainBody(botName, prefix),
      '',
      `📋 ${prefix}menu categories`,
      `📚 ${prefix}menu all`,
      `👥 ${prefix}menu group`,
    ].join('\n');
    await sendPlainFallback(sock, jid, fallback, { quoted: msg });
    return null;
  }
}

export default {
  name: 'menu',
  aliases: ['m'],
  description: 'Open the native carousel ABIX-AE command menu',
  category: 'system',
  async execute(ctx) {
    return sendMenu(ctx);
  },
};
