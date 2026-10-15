const { lookup } = require('./billscrap');

function formatResult(item, reference) {
  if (item.lookup.manual) {
    return `🧾 *${item.key} BILL PORTAL*\n\n${item.lookup.message}\n\n🔗 ${item.url}`;
  }
  const rows = Object.entries(item.lookup.fields || {})
    .slice(0, 20)
    .map(([key, value]) => `• *${key}:* ${value}`);
  return `🧾 *${item.key} BILL RESULT*\n🔢 Reference: ${reference}\n\n${rows.length ? rows.join('\n') : 'Bill details nahi mile.'}\n\n🔗 ${item.lookup.pdfUrl || item.lookup.sourceUrl}`;
}

module.exports = {
  command: 'bill',
  aliases: ['checkbill', 'getbill'],
  category: 'utility',
  description: 'Provider reference number se bill check karein',
  usage: '-bill LESCO 12345678901234',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const provider = args[0];
    const reference = args.slice(1).join('').replace(/\D/g, '');
    if (!provider || !reference) {
      return sock.sendMessage(chatId, {
        text: '❌ Format: *-bill PROVIDER NUMBER*\nExample: *-bill LESCO 12345678901234*\n\n-billscrap se complete list dekhein.'
      }, { quoted: message });
    }

    try {
      await sock.sendPresenceUpdate?.('composing', chatId);
      const result = await lookup(provider, reference);
      await sock.sendMessage(chatId, { text: formatResult(result, reference) }, { quoted: message });
    } catch (error) {
      console.error('Bill lookup failed:', error);
      const known = require('./billscrap').getProvider(provider);
      await sock.sendMessage(chatId, {
        text: `❌ ${String(provider).toUpperCase()} bill fetch nahi ho saka.\n\n_${error.message}_\n\n${known ? `Official portal: ${known.url}` : '-billscrap'}`
      }, { quoted: message });
    } finally {
      await sock.sendPresenceUpdate?.('paused', chatId).catch?.(() => {});
    }
  }
};
