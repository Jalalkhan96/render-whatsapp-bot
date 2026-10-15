const fs = require('fs');
const os = require('os');
const path = require('path');
const settings = require('../settings');
const { getChannelInfo } = require('../lib/channelInfo');
const isOwner = require('../lib/isOwner');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = -1;
  do {
    size /= 1024;
    index += 1;
  } while (size >= 1024 && index < units.length - 1);
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[index]}`;
}

function getSize(target) {
  if (!fs.existsSync(target)) return 0;
  try {
    const stat = fs.lstatSync(target);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    return fs.readdirSync(target).reduce((total, item) => total + getSize(path.join(target, item)), 0);
  } catch {
    return 0;
  }
}

function clearDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const target = path.join(dir, item);
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (error) {
      console.error(`[CACHE] Could not remove ${target}:`, error.message);
    }
  }
}

module.exports = {
  command: 'cache',
  aliases: ['clearcache', 'npmcache', 'cleancache'],
  category: 'system',
  ownerOnly: true,
  legacyDot: true,
  heavy: true,
  description: 'Clear the user npm cache without touching bot files or sessions',
  usage: `${settings.prefixes[0]}cache`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    const quoted = { quoted: message };
    const forwarded = getChannelInfo().contextInfo;

    if (!(await isOwner(senderId, sock, chatId))) {
      return sock.sendMessage(chatId, { text: '❌ Owner only command.', contextInfo: forwarded }, quoted);
    }

    try {
      await sock.sendMessage(chatId, {
        text: '🧹 *CACHE CLEANER*\n\n⏳ NPM cache check ho raha hai...',
        contextInfo: forwarded,
      }, quoted);

      const npmCache = path.join(os.homedir(), '.npm');
      const before = getSize(npmCache);
      if (!fs.existsSync(npmCache)) {
        return sock.sendMessage(chatId, {
          text: '✅ *CACHE ALREADY CLEAN*\n\n`.npm` cache folder nahi mila.',
          contextInfo: forwarded,
        }, quoted);
      }

      clearDirectory(npmCache);
      const after = getSize(npmCache);
      const freed = Math.max(0, before - after);
      return sock.sendMessage(chatId, {
        text: [
          '🧹 *CACHE CLEANED*',
          '━━━━━━━━━━━━━━━━━━',
          '',
          `📦 Before: ${formatSize(before)}`,
          `🗑️ Freed: ${formatSize(freed)}`,
          `📦 After: ${formatSize(after)}`,
          '',
          '✅ `node_modules` safe hai',
          '✅ `session` safe hai',
          '✅ Bot files safe hain',
        ].join('\n'),
        contextInfo: forwarded,
      }, quoted);
    } catch (error) {
      console.error('[CACHE] Error:', error);
      return sock.sendMessage(chatId, {
        text: `❌ *CACHE CLEAN FAILED*\n\nError: ${error.message || 'Unknown error'}`,
        contextInfo: forwarded,
      }, quoted);
    }
  },
};
