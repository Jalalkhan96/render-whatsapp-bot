'use strict';

const storage = require('../lib/storageMaintenance');
const owner = require('../lib/owner');

async function isConfiguredOwner(message, sock, chatId) {
  const senderId = message?.key?.participant || message?.key?.remoteJid;
  if (!senderId) return false;
  const resolved = await owner.resolveOwner(senderId, sock, chatId);
  // Deliberately exclude bot identity: only the configured primary and
  // secondary owners can perform storage administration.
  return Boolean(resolved.isPrimaryOwner || resolved.isSecondaryOwner);
}

function mb(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

async function handler(sock, message, args = [], context = {}) {
  const chatId = context.chatId || message?.key?.remoteJid;
  if (!chatId) return;

  if (!(await isConfiguredOwner(message, sock, chatId))) {
    return sock.sendMessage(chatId, {
      text: '🔒 *Owner only*\n\nOnly the primary owner and secondary owner can clear bot memory/storage.'
    }, { quoted: message });
  }

  const action = String(args[0] || '').trim().toLowerCase();

  if (['status', 'info', 'check'].includes(action)) {
    const s = storage.stats();
    return sock.sendMessage(chatId, {
      text:
        `💾 *BOT STORAGE STATUS*\n\n` +
        `Backend: *${s.backend || 'unknown'}*\n` +
        `Cached messages: *${s.messages ?? 0}*\n` +
        `Contacts: *${s.contacts ?? 0}*\n` +
        `Chats: *${s.chats ?? 0}*\n` +
        `Store file: *${s.storeMB} MB* / ${s.maxStoreFileMB} MB\n` +
        `Message-count file: *${s.messageCountMB} MB*\n` +
        `Heap used: *${s.heapUsedMB} MB*\n` +
        `Process RSS: *${s.rssMB} MB*\n` +
        `Auto-clear: *${s.autoClearEnabled ? 'ON' : 'OFF'}*\n` +
        `Interval: *${Math.round(s.autoClearIntervalMs / 60000)} min*\n\n` +
        `_Commands: -clearmemory  |  -clearmemory status  |  -clearmemory all_`
    }, { quoted: message });
  }

  const full = ['all', 'full', 'hard'].includes(action);
  await sock.sendMessage(chatId, {
    text: full
      ? '🧹 *Full storage cleanup started...*\n\nAuth/session files will be preserved.'
      : '🧹 *Memory/cache cleanup started...*'
  }, { quoted: message });

  const result = await storage.clearMessageCache({
    full,
    forceTemp: true,
    reason: `manual:${full ? 'full' : 'cache'}`,
  });

  return sock.sendMessage(chatId, {
    text:
      `✅ *STORAGE CLEANUP COMPLETE*\n\n` +
      `🧠 Message cache: *cleared*\n` +
      `🧹 Temp files: *${result.tempFiles}* removed\n` +
      `💾 Temp space freed: *${mb(result.tempBytes)}*\n` +
      `📦 Store now: *${result.after.storeMB} MB*\n` +
      `📝 Cached messages: *${result.after.messages ?? 0}*\n` +
      `👤 Contacts: *${result.after.contacts ?? 0}*\n` +
      `💬 Chats: *${result.after.chats ?? 0}*\n\n` +
      (full
        ? '⚠️ Full mode also reset contacts, chats and message counts.\n🔐 WhatsApp auth/session data was NOT deleted.'
        : '🔐 WhatsApp auth/session data was NOT deleted.\n♻️ Automatic cleanup remains active.')
  }, { quoted: message });
}

module.exports = {
  command: 'clearmemory',
  aliases: ['clearmem', 'clearstore', 'memclear'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only memory/cache and disposable storage cleanup.',
  usage: '-clearmemory [status|all]',
  handler,
};
