const giveawayStore = require('../lib/giveawayStore');
const isAdmin = require('../lib/isAdmin');
const { sendInteractiveMessage } = require('../lib/interactiveMenu');

const timers = new Map();

function shortId(id) { return String(id || '').slice(0, 8); }
function mention(jid) { return `@${String(jid).split('@')[0].replace(/\D/g, '')}`; }
function timeLeft(end) {
  const ms = Math.max(0, new Date(end).getTime() - Date.now());
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function render(row, prefix, ended = false) {
  const lines = [
    '╭━━━〔 🎉 *GIVEAWAY* 〕━━━╮',
    '',
    `🎁 *PRIZE*\n${row.prize}`,
    '',
    `👥 *PARTICIPANTS*\n${row.participants.length}`,
    `🏆 *WINNERS*\n${row.winner_count}`,
    ended ? `📌 *STATUS*\n${row.status.toUpperCase()}` : `⏳ *TIME LEFT*\n${timeLeft(row.end_time)}`,
    '',
    `🆔 ${shortId(row.giveaway_id)}`,
    '',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
  ];
  if (ended) lines.push('', row.winners.length ? `🏆 ${row.winners.map(mention).join(', ')}` : '😕 No valid participants were available.');
  return lines.join('\n');
}

async function requireAdmin(sock, chatId, senderId) {
  const status = await isAdmin(sock, chatId, senderId);
  return status.isSenderAdmin;
}

async function announceEnd(sock, row, message) {
  const prefix = message?.context?.prefix || '.';
  const mentions = row.winners || [];
  const text = `${render(row, prefix, true)}\n\n${mentions.length ? `🎊 Winner${mentions.length > 1 ? 's' : ''}: ${mentions.map(mention).join(', ')}` : 'No winner could be selected.'}`;
  const options = mentions.length ? { mentions } : {};
  await sock.sendMessage(row.group_jid, { text, ...options }, { quoted: message?.msg || undefined });
}

function schedule(sock, row) {
  if (!row || row.status !== 'active') return;
  if (timers.has(row.giveaway_id)) return;
  const delay = Math.max(1000, new Date(row.end_time).getTime() - Date.now());
  const timer = setTimeout(async () => {
    timers.delete(row.giveaway_id);
    try {
      const ended = await giveawayStore.finish(row.giveaway_id, 'ended');
      if (ended) await announceEnd(sock, ended, {});
    } catch (error) { console.error('[GIVEAWAY EXPIRE]', error); }
  }, Math.min(delay, 2_147_000_000));
  timer.unref?.();
  timers.set(row.giveaway_id, timer);
}

async function recover(sock) {
  try {
    await giveawayStore.init();
    const expired = await giveawayStore.expireDue();
    for (const row of expired) await announceEnd(sock, row, {});
    const activeRows = await giveawayStore.activeAll();
    for (const row of activeRows) schedule(sock, row);
  } catch (error) { console.error('[GIVEAWAY RECOVERY]', error.message); }
}

module.exports = {
  command: 'giveaway',
  aliases: ['give', 'gw'],
  category: 'group',
  groupOnly: true,
  description: 'Create and manage persistent group giveaways',
  usage: '.giveaway start <prize> [winners] [minutes]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    try {
      await recover(sock);
      let active = await giveawayStore.activeForGroup(chatId);
      if (active && new Date(active.end_time).getTime() <= Date.now()) {
        active = await giveawayStore.finish(active.giveaway_id, 'ended');
        await announceEnd(sock, active, {});
        active = null;
      }
      if (active) schedule(sock, active);

      const action = String(args[0] || 'status').toLowerCase();
      const prefix = context.prefix || '.';

      if (action === 'join') {
        const id = String(args[1] || '').trim();
        if (!id) return sock.sendMessage(chatId, { text: `❌ Use ${prefix}giveaway join <giveaway-id>.` }, { quoted: message });
        const target = await giveawayStore.get(id);
        if (!target || target.group_jid !== chatId || target.status !== 'active') return sock.sendMessage(chatId, { text: '❌ This giveaway is not active.' }, { quoted: message });
        if (new Date(target.end_time).getTime() <= Date.now()) {
          const ended = await giveawayStore.finish(id, 'ended');
          await announceEnd(sock, ended, {});
          return;
        }
        const result = await giveawayStore.addParticipant(id, senderId);
        if (!result.ok && result.reason === 'already') return sock.sendMessage(chatId, { text: 'ℹ️ You are already participating.' }, { quoted: message });
        if (!result.ok) return sock.sendMessage(chatId, { text: '❌ Giveaway is no longer active.' }, { quoted: message });
        return sock.sendMessage(chatId, { text: `🎉 You joined the giveaway!\n\n👥 Participants: ${result.giveaway.participants.length}` }, { quoted: message });
      }

      if (action === 'start') {
        const admin = await requireAdmin(sock, chatId, senderId);
        if (!admin && !context.isOwner) return sock.sendMessage(chatId, { text: '❌ Only current group admins can start a giveaway.' }, { quoted: message });
        if (active) return sock.sendMessage(chatId, { text: `❌ A giveaway is already active.\n🆔 ${shortId(active.giveaway_id)}` }, { quoted: message });
        const prize = args.slice(1).filter(Boolean).join(' ');
        if (!prize) return sock.sendMessage(chatId, { text: `🎉 *GIVEAWAY START*\n\nUsage:\n${prefix}giveaway start <prize> [winners] [minutes]\n\nExample:\n${prefix}giveaway start iPhone 1 10` }, { quoted: message });
        const numeric = args.slice(1).filter(v => /^\d+$/.test(v));
        const winnerCount = Math.max(1, Math.min(20, Number(numeric[0] || 1)));
        const durationMinutes = Math.max(1, Math.min(10080, Number(numeric[1] || 10)));
        const cleanPrize = prize.replace(/\s+\d+\s+\d+$/, '').trim() || prize;
        const row = await giveawayStore.create({ groupJid: chatId, creatorJid: senderId, prize: cleanPrize, winnerCount, durationMinutes });
        schedule(sock, row);
        const joinId = `${prefix}giveaway join ${row.giveaway_id}`;
        return sendInteractiveMessage(sock, chatId, {
          body: `${render(row, prefix)}\n\n📢 Hosted by ${mention(senderId)}`,
          footer: `${prefix}giveaway status • ID ${shortId(row.giveaway_id)}`,
          buttons: [
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎉 JOIN GIVEAWAY', id: joinId }) },
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📊 STATUS', id: `${prefix}giveaway status` }) },
          ],
        }, { quoted: message });
      }

      if (!active) return sock.sendMessage(chatId, { text: `ℹ️ No active giveaway in this group.\n\nStart one with:\n${prefix}giveaway start <prize> [winners] [minutes]` }, { quoted: message });

      if (['end', 'cancel'].includes(action)) {
        const admin = await requireAdmin(sock, chatId, senderId);
        if (!admin && !context.isOwner) return sock.sendMessage(chatId, { text: '❌ Only the giveaway creator or a current group admin can manage it.' }, { quoted: message });
        const row = await giveawayStore.finish(active.giveaway_id, action === 'cancel' ? 'cancelled' : 'ended');
        const timer = timers.get(active.giveaway_id);
        if (timer) { clearTimeout(timer); timers.delete(active.giveaway_id); }
        if (action === 'cancel') return sock.sendMessage(chatId, { text: `❌ Giveaway cancelled.\n🆔 ${shortId(row.giveaway_id)}` }, { quoted: message });
        return announceEnd(sock, row, { msg: message });
      }

      if (action === 'status') return sock.sendMessage(chatId, { text: render(active, prefix) }, { quoted: message });
      return sock.sendMessage(chatId, { text: `❌ Unknown giveaway action.\n\n${prefix}giveaway start <prize> [winners] [minutes]\n${prefix}giveaway join <id>\n${prefix}giveaway status\n${prefix}giveaway end\n${prefix}giveaway cancel` }, { quoted: message });
    } catch (error) {
      console.error('[GIVEAWAY]', error);
      return sock.sendMessage(chatId, { text: `❌ Giveaway error.\n\n${error.message || 'Please try again.'}` }, { quoted: message });
    }
  },
};
