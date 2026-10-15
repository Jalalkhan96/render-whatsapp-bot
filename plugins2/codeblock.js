'use strict';

const { sendCodeMessage } = require('./wa-tricks/code-text-design.cjs');
const { normalizeMessageContent } = require('@whiskeysockets/baileys');

function unwrap(content) {
  let current = content;
  for (let i = 0; i < 6 && current; i += 1) {
    if (current?.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current?.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current?.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else break;
  }
  return current || {};
}

function messageText(message) {
  const raw = unwrap(normalizeMessageContent(message?.message || {}) || message?.message || {});
  return String(
    raw?.conversation ||
    raw?.extendedTextMessage?.text ||
    raw?.imageMessage?.caption ||
    raw?.videoMessage?.caption ||
    raw?.documentMessage?.caption ||
    ''
  );
}

function quotedText(message) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return '';
  const raw = unwrap(quoted);
  return String(raw?.conversation || raw?.extendedTextMessage?.text || raw?.documentMessage?.caption || '');
}

function cleanFences(value) {
  const text = String(value || '').trim();
  const match = text.match(/^```([\w#+.-]*)\n?([\s\S]*?)```$/);
  if (!match) return { language: '', code: text };
  return { language: match[1] || '', code: match[2].trim() };
}

module.exports = {
  command: 'codeblock',
  aliases: ['code', 'codeview', 'cb', 'sendcode'],
  category: 'tools',
  description: 'Send code using WhatsApp native rich code block when supported.',
  usage: '-codeblock <language> <code> (or reply to code)',
  async handler(sock, message, args = {}, context = {}) {
    const chatId = context.chatId || message?.key?.remoteJid;
    const list = Array.isArray(args) ? args : [];
    let language = String(list[0] || '').trim();
    let code = list.slice(1).join(' ').trim();

    const rawBody = messageText(message).trim();
    const quoted = quotedText(message).trim();
    if (!code && quoted) {
      const parsed = cleanFences(quoted);
      language = parsed.language || language || 'javascript';
      code = parsed.code;
    }

    if (!code && rawBody) {
      const stripped = rawBody.replace(/^[-./!#$]\S+\s*/i, '');
      const parsed = cleanFences(stripped);
      if (parsed.code && parsed.code !== stripped) {
        language = parsed.language || language || 'javascript';
        code = parsed.code;
      }
    }

    if (!code) {
      return sock.sendMessage(chatId, {
        text: '📦 *Code Block*\n\nUsage:\n`-codeblock javascript const x = 42;`\n\nOr reply to a code message and send `-codeblock javascript`.'
      }, { quoted: message });
    }

    // If the first token is clearly not a language, treat the whole args string as code.
    const known = /^(js|javascript|ts|typescript|py|python|bash|sh|shell|html|css|java|c|c\+\+|cpp|c#|cs|go|golang|rust|php|sql|json|yaml|yml|lua|powershell|ps|ps1)$/i;
    if (!known.test(language)) {
      code = [language, code].filter(Boolean).join(' ');
      language = 'javascript';
    }

    await sendCodeMessage(sock, chatId, {
      language,
      code,
      intro: '💻 *Code*',
    }, message);
  },
};
