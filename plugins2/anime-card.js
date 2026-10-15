'use strict';

const { sendRandomCard, sendCard, findCard, loadCards, DESIGNS, stats } = require('../lib/animeCard.cjs');

module.exports = {
  command: 'card',
  aliases: ['animecard', 'shoobcard', 'acard'],
  category: 'anime',
  description: 'Show a local anime collectible card',
  usage: '-card | -card random | -card search <name> | -card <id> | -card design <1-6> | -card stats',
  async handler(sock, message, args = [], context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    if (!jid) return;
    const input = String(args.join(' ') || '').trim();

    if (!input || input.toLowerCase() === 'random') return sendRandomCard(sock, jid, message);

    if (/^designs?$/i.test(input)) {
      return sock.sendMessage(jid, {
        text: [`🎨 *CARD DESIGNS*`, '', ...DESIGNS.map((d, i) => `${i + 1}. ${d.label} — ${d.id}`), '', 'Example: -card design 4'].join('\n')
      }, { quoted: message });
    }

    const designMatch = input.match(/^design\s*(\d+|[a-z-]+)$/i);
    if (designMatch) return sendRandomCard(sock, jid, message, { design: designMatch[1] });

    if (/^stats?$/i.test(input)) {
      const s = stats();
      return sock.sendMessage(jid, { text: `🎴 *LOCAL ANIME CARD DB*\n\n🃏 Cards: ${s.count}\n🎬 Series: ${s.series}\n🎨 Designs: ${s.designs.length}\n\n${Object.entries(s.tiers).map(([k, v]) => `⭐ T${k}: ${v}`).join('\n')}` }, { quoted: message });
    }

    if (/^search\s+/i.test(input)) {
      const q = input.replace(/^search\s+/i, '').trim();
      const cards = loadCards().filter(c => `${c.character} ${c.series}`.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
      if (!cards.length) return sock.sendMessage(jid, { text: `❌ No cards found for *${q}*.` }, { quoted: message });
      return sock.sendMessage(jid, { text: ['🔎 *CARD SEARCH*', '', ...cards.map((c, i) => `${i + 1}. ${c.character} • ${c.series} • T${c.tier ?? '?' } • ID ${c.id}`), '', `Use -card <id> to open one.`].join('\n') }, { quoted: message });
    }

    const card = findCard(input);
    if (!card) return sock.sendMessage(jid, { text: `❌ Card *${input}* was not found.` }, { quoted: message });
    return sendCard(sock, jid, message, card);
  },
};
