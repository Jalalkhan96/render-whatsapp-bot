import { config } from '../config.js';
import { startNewConversation } from '../memory/conversation.js';
import { getConnectionStatus } from '../whatsapp/connection.js';
import { getTotalCommandCount } from './catalog.js';

export function handleHelp() {
  const p = config.bot.prefix || '$';
  return `*${config.bot.name}* — Command Help\n\n` +
    `Total commands: *${getTotalCommandCount()}*\n\n` +
    `${p}menu — Interactive command menu\n` +
    `${p}menu group — Group commands\n` +
    `${p}menu media — Media commands\n` +
    `${p}menu fun — Fun/meme commands\n` +
    `${p}ask <question> — Ask Gemini\n` +
    `${p}yt <url> — YouTube download (≤100 MB)\n` +
    `${p}tt <url> — TikTok video/slides\n` +
    `${p}dl <url> — Universal downloader\n` +
    `${p}doc <url> — Download as document\n` +
    `${p}pp — Profile photo (reply/mention/number)\n` +
    `${p}meme [topic] — Reddit/Pinterest meme\n` +
    `${p}meme hindi — Hindi meme\n` +
    `${p}meme sound <name> — MyInstants meme sound\n` +
    `${p}randomsound — Random meme sound\n\n` +
    `${p}groupinfo ${p}staff ${p}link ${p}ping ${p}status ${p}uptime\n\n` +
    `Normal messages are ignored. Only commands beginning with / or $ are processed.`;
}

export async function handleNew(userId, conversationType) {
  await startNewConversation(userId, conversationType);
  return '✅ New conversation started. Previous context has been cleared.';
}

export function handleStatus() {
  return `*Bot Status*\nWhatsApp: ${getConnectionStatus()}\nModel: ${config.gemini.model}\nBot: ${config.bot.name}\nPrefix: ${config.bot.prefix}`;
}

export function handleModel() {
  return `Current AI model: *${config.gemini.model}*`;
}

export function handlePing() {
  return `🏓 Pong! ${new Date().toISOString()}`;
}
