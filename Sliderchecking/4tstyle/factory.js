const { sendCarousel, handleButton, prefixOf } = require('./carousel');
const social = require('./socialBridge');

function makeSearchPlugin(config) {
  return {
    command: config.command,
    aliases: config.aliases || [],
    category: 'social-search',
    description: config.description || `${config.title} search with a 5-card WhatsApp carousel`,
    usage: `${config.command} <query>`,
    async handler(sock, message, args = [], context = {}) {
      const jid = context.chatId || message?.key?.remoteJid;
      if (!jid) return;

      if (String(args[0] || '').toLowerCase() === '__button') {
        return handleButton({
          sock, message, jid, args, prefix: prefixOf(context), command: config.command,
        });
      }

      const query = args.join(' ').trim();
      if (!query) {
        return sock.sendMessage(jid, {
          text: `🔎 *${config.title}*\\n\\nUsage:\\n${prefixOf(context)}${config.command} <query>`,
        }, { quoted: message });
      }

      try {
        await sock.sendMessage(jid, { react: { text: '🔎', key: message.key } }).catch(() => {});
        const fn = social[config.search];
        if (typeof fn !== 'function') throw new Error(`Search adapter ${config.search} is unavailable.`);
        const items = await fn(query);
        if (!Array.isArray(items) || !items.length) throw new Error('No results found.');

        await sendCarousel({
          sock, message, jid, query, command: config.command,
          items, prefix: prefixOf(context), title: config.title,
          buttonFactory: config.buttons || (() => [{ text: '🔗 OPEN', action: 'open' }, { text: '📋 COPY', action: 'copy' }]),
        });

        await sock.sendMessage(jid, { react: { text: '✅', key: message.key } }).catch(() => {});
      } catch (error) {
        await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
        console.error(`[4T-STYLE:${config.command}]`, error?.stack || error);
        return sock.sendMessage(jid, {
          text: `❌ *${config.title} failed.*\\n\\n${String(error?.message || 'Please try again.').slice(0, 500)}`,
        }, { quoted: message });
      }
    },
  };
}

module.exports = { makeSearchPlugin };
