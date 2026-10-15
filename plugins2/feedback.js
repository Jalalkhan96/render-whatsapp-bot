'use strict';

/**
 * ABIX-AE standalone feedback / request intake.
 *
 * This plugin is intentionally independent from -menu/-allmenu and other
 * menu implementations. It supports both a prompt mode and a one-message
 * submission mode so it does not require a second conversation/state system.
 */

const crypto = require('crypto');

const CATEGORIES = {
  issue: '🐛 Issue / Bug',
  feature: '✨ Feature Request',
  update: '🔧 Update Needed',
  bot: '🤖 Want a Bot Like This',
  suggestion: '💡 Suggestion',
  other: '📝 Other'
};

function clean(value, max = 4000) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, max);
}

function makeId() {
  return `ABX-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function usage(prefix) {
  return [
    '📝 *ABIX-AE FEEDBACK*',
    '',
    'Tell us what you need. You can submit a request directly or use the prompt below.',
    '',
    '*What do you want?*',
    '→ New feature / command / bot / design / API / other',
    '',
    '*What is the issue?*',
    '→ Explain the problem or error you are facing.',
    '',
    '*What needs to be updated?*',
    '→ Existing command, feature, UI, menu, media system, etc.',
    '',
    '*Want a bot like this?*',
    '→ If yes, describe the bot and features you want.',
    '',
    '*Anything else? 😜*',
    '→ Suggestions, improvements or extra requirements.',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '*Quick submit:*',
    `${prefix}feedback issue <details>`,
    `${prefix}feedback feature <details>`,
    `${prefix}feedback update <details>`,
    `${prefix}feedback bot <details>`,
    `${prefix}feedback suggestion <details>`,
    `${prefix}feedback other <details>`
  ].join('\n');
}

module.exports = {
  command: 'feedback',
  aliases: ['suggest', 'request'],
  category: 'utility',
  description: 'Submit ABIX feedback, bug reports, feature requests and bot requests',
  usage: '.feedback [issue|feature|update|bot|suggestion|other] <details>',

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message?.key?.remoteJid;
    if (!chatId) return;

    const prefix = context.prefix || '.';
    const raw = clean(args.join(' '));

    try {
      if (!raw) {
        await sock.sendMessage(
          chatId,
          {
            text: usage(prefix)
          },
          { quoted: message }
        );
        return;
      }

      const match = raw.match(/^([a-z]+)\s+([\s\S]+)$/i);
      if (!match || !CATEGORIES[match[1].toLowerCase()]) {
        await sock.sendMessage(
          chatId,
          {
            text:
              `❌ *Invalid feedback type.*\n\n` +
              `Use:\n` +
              Object.entries(CATEGORIES)
                .map(([key, label]) => `${prefix}feedback ${key} <details> — ${label}`)
                .join('\n')
          },
          { quoted: message }
        );
        return;
      }

      const type = match[1].toLowerCase();
      const details = clean(match[2], 4000);
      const id = makeId();

      const response = [
        '✅ *FEEDBACK RECEIVED*',
        '',
        `🆔 ID: *#${id}*`,
        `📌 Type: *${CATEGORIES[type]}*`,
        '',
        '📝 *Your request:*',
        details,
        '',
        '━━━━━━━━━━━━━━━━━━',
        'Thank you ❤️ Your feedback has been received and can be reviewed by the ABIX team.'
      ].join('\n');

      await sock.sendMessage(chatId, { text: response }, { quoted: message });
    } catch (error) {
      console.error('[feedback] failed:', error);
      try {
        await sock.sendMessage(
          chatId,
          { text: '❌ Feedback could not be processed right now. Please try again.' },
          { quoted: message }
        );
      } catch {}
    }
  }
};
