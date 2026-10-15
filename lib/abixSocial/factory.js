const service = require('./searchService');
const { sendCarousel, handleButton } = require('./carousel');

function makeSearchPlugin({command, aliases = [], platform, searchFn, buttons = true}) {
  return {
    command,
    aliases,
    category: 'Social Search',
    description: `Search ${platform} and return five swipeable results`,
    usage: `-${command} <query>`,
    async handler(sock, message, args = [], context = {}) {
      const jid = message?.key?.remoteJid || message?.chat || context.jid;
      const cleanArgs = Array.isArray(args) ? args.map(String) : [];
      if (cleanArgs[0] === '__button') {
        const ok = await handleButton(sock, jid, cleanArgs[2], cleanArgs[1], cleanArgs[3]);
        if (!ok) await sock.sendMessage(jid, { text: '⚠️ This slider action has expired. Run the search again.' });
        return;
      }
      const query = cleanArgs.join(' ').trim();
      if (!query) { await sock.sendMessage(jid, { text: `🔎 Usage: -${command} <query>` }); return; }
      try {
        await sock.sendMessage(jid, { react: { text: '🔎', key: message.key } }).catch(()=>{});
        const results = await service[searchFn](query);
        if (results.length < 5) throw new Error(`Apify returned ${results.length} usable results; five are needed for the slider.`);
        await sendCarousel(sock, jid, command, platform, query, results);
        await sock.sendMessage(jid, { react: { text: '✅', key: message.key } }).catch(()=>{});
      } catch (e) {
        const msg = e?.allKeysExhausted ? 'All configured Apify keys are currently on cooldown.' : (e?.message || 'Unknown Apify error');
        await sock.sendMessage(jid, { text: `❌ ${platform} search failed.\n\n${msg}` });
      }
    }
  };
}

module.exports = { makeSearchPlugin };
