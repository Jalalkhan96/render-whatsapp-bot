const { getChannelInfo } = require('../lib/channelInfo');
const feed = require('../lib/feedMonitor');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'watch',
  aliases: ['feeds', 'autonews', 'getupdates'],
  category: 'owner',
  description: 'Auto-post news monitor — nayi post aati hai to chat mein auto aati hai (groups bhi)',
  usage: '.watch  /  .watch add <query>  /  .watch rm <num>',
  ownerOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const sub = (args[0] || '').toLowerCase();

    try {
      if (!sub) {
        const list = feed.listFeeds(chatId);
        const text =
          `📡 *AUTO-POST MONITOR*\n` +
          `Har ${Math.round(feed.INTERVAL_MS / 60000)} min mein nayi post check hoti hai.\n\n` +
          `*Is chat ke feeds:*\n` +
          list.map((l, i) => `└ ${i + 1}. ${l}`).join('\n') + '\n\n' +
          `Commands:\n` +
          `└ ⚡ \`.watch add <query>\` — nayi feed\n` +
          `└ ⚡ \`.watch add bbc\` — fast source\n` +
          `└ ⚡ \`.watch rm <num>\` — feed hatayein\n\n` +
          `💡 Group aur DM dono mein kaam karta hai.`;
        return await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
      }

      if (sub === 'add') {
        const q = args.slice(1).join(' ').trim();
        if (!q) {
          return await sock.sendMessage(chatId, {
            text: '⚡ Query do: .watch add pakistan  •  .watch add site:bbc.com',
            contextInfo: FAKE_FORWARD
          }, { quoted: message });
        }
        const labelMap = { pakistan: '🇵🇰 Pakistan', world: '🌍 World', tech: '💻 Tech', cricket: '🏏 Cricket', bbc: '📻 BBC', dawn: '🌄 Dawn' };
        const label = labelMap[q.toLowerCase()];
        const cleanQ = ['bbc'].includes(q.toLowerCase()) ? 'site:bbc.com' : q;
        const n = feed.addFeed(chatId, cleanQ, label);
        await sock.sendMessage(chatId, {
          text: `✅ Feed add ho gayi (${n} total).\n_Query:_ ${cleanQ}\nAb naye posts auto aayenge.`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
        return;
      }

      if (sub === 'rm') {
        const n = parseInt(args[1], 10);
        if (!n) {
          return await sock.sendMessage(chatId, {
            text: '⚡ Number do: .watch rm 2',
            contextInfo: FAKE_FORWARD
          }, { quoted: message });
        }
        const removed = feed.removeFeed(chatId, n - 1);
        if (!removed) {
          return await sock.sendMessage(chatId, { text: '❌ Aisa feed nahi mila.', contextInfo: FAKE_FORWARD }, { quoted: message });
        }
        await sock.sendMessage(chatId, {
          text: `🗑️ Feed removed: ${removed.label}`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
        return;
      }

      await sock.sendMessage(chatId, { text: 'Usage: .watch  /  .watch add <q>  /  .watch rm <num>', contextInfo: FAKE_FORWARD }, { quoted: message });
    } catch (err) {
      console.error('[WATCH] Error:', err.message);
      await sock.sendMessage(chatId, { text: '❌ ' + err.message, contextInfo: FAKE_FORWARD }, { quoted: message });
    }
  }
};