const fs = require('fs');
const os = require('os');
const path = require('path');
const settings = require('../settings');
const { getChannelInfo } = require('../lib/channelInfo');
const isOwner = require('../lib/isOwner');

const ROOT = path.resolve(__dirname, '..');

function formatBytes(bytes) {
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

function getEntries(target, relative = '') {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) return [{ path: relative || path.basename(target), bytes: stat.size, depth: relative ? relative.split(path.sep).length : 1, file: true }];
  if (!stat.isDirectory()) return [];

  const rows = [{ path: relative || '.', bytes: 0, depth: relative ? relative.split(path.sep).length : 0, file: false }];
  for (const item of fs.readdirSync(target)) {
    const childRelative = relative ? path.join(relative, item) : item;
    rows.push(...getEntries(path.join(target, item), childRelative));
  }
  const current = rows[0];
  current.bytes = rows.slice(1).reduce((total, row) => total + row.bytes, 0);
  return rows;
}

function getStorage() {
  const rows = getEntries(ROOT);
  const topLevel = rows.filter(row => row.depth === 1 && !row.file).sort((a, b) => b.bytes - a.bytes);
  const files = rows.filter(row => row.file).sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  return { topLevel, files, total: rows[0]?.bytes || 0 };
}

function diskInfo() {
  if (typeof fs.statfsSync !== 'function') return '';
  try {
    const stats = fs.statfsSync(ROOT);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const used = Math.max(0, total - free);
    const usage = total ? `${((used / total) * 100).toFixed(1)}%` : '0%';
    return `\n💽 *FILESYSTEM*\n━━━━━━━━━━━━━━━━━━\n📊 Total: ${formatBytes(total)}\n📦 Used: ${formatBytes(used)}\n🆓 Free: ${formatBytes(free)}\n📈 Usage: ${usage}\n`;
  } catch {
    return '';
  }
}

module.exports = {
  command: 'storage',
  aliases: ['space', 'disk', 'stor'],
  category: 'system',
  ownerOnly: true,
  legacyDot: true,
  heavy: true,
  description: 'Show bot project and filesystem storage usage',
  usage: `${settings.prefixes[0]}storage`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    const quoted = { quoted: message };
    const forwarded = getChannelInfo().contextInfo;

    if (!(await isOwner(senderId, sock, chatId))) {
      return sock.sendMessage(chatId, { text: '❌ Owner only command.', contextInfo: forwarded }, quoted);
    }

    try {
      const { topLevel, files, total } = getStorage();
      if (!topLevel.length) {
        return sock.sendMessage(chatId, { text: '❌ Storage information nahi mil saki.', contextInfo: forwarded }, quoted);
      }

      const lines = [
        '💾 *ABIX STORAGE*',
        '━━━━━━━━━━━━━━━━━━',
        '',
        ...topLevel.flatMap(item => [`📁 ${item.path}`, ` └─ ${formatBytes(item.bytes)}`]),
        '',
        '━━━━━━━━━━━━━━━━━━',
        `📦 *Project Total:* ${formatBytes(total)}`,
      ];
      if (files.length) {
        lines.push('', '🔥 *LARGEST FILES*', '━━━━━━━━━━━━━━━━━━');
        for (const file of files) lines.push(`📄 ${file.path}`, ` └─ ${formatBytes(file.bytes)}`);
      }
      lines.push(diskInfo());
      return sock.sendMessage(chatId, { text: lines.join('\n'), contextInfo: forwarded }, quoted);
    } catch (error) {
      console.error('[STORAGE] Error:', error);
      return sock.sendMessage(chatId, {
        text: `❌ Storage check failed.\n\nError: ${error.message || 'Unknown error'}`,
        contextInfo: forwarded,
      }, quoted);
    }
  },
};
