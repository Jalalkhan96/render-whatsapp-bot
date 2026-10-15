const axios = require('axios');
const { getNews } = require('../lib/newsrss');
const { getChannelInfo } = require('../lib/channelInfo');

const channelInfo = getChannelInfo({ newsletterName: 'ABIX-AE' });

async function send(sock, chatId, message, text) {
  return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
}

module.exports = [
  {
    command: 'pkmenu',
    aliases: ['pakistanmenu'],
    category: 'info',
    description: 'Verified Pakistan information menu',
    usage: '-pkmenu',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      const prefix = context.prefix || '-';
      return send(sock, chatId, message,
        `🇵🇰 *PAKISTAN MENU*\n\n` +
        `📰 ${prefix}pknews — verified Pakistan headlines\n` +
        `💱 ${prefix}pkcurrency — live exchange rates against PKR\n\n` +
        'ℹ️ Bills, fuel, jobs, scholarships, alerts and PDFs are shown only after a verified usable source is configured.');
    },
  },
  {
    command: 'pknews',
    aliases: ['pakistannews'],
    category: 'info',
    description: 'Verified latest Pakistan news',
    usage: '-pknews',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      try {
        const { label, items } = await getNews('pakistan');
        if (!items.length) return send(sock, chatId, message, '⚠️ کوئی verified Pakistan news update دستیاب نہیں۔');
        const lines = items.slice(0, 8).map((item, index) => {
          const when = item.pubDate ? `\n🕒 ${new Date(item.pubDate).toLocaleString()}` : '';
          return `📰 ${index + 1}. ${item.title}${when}\n🔗 ${item.link}\n📡 Source: ${item.source || label}`;
        }).join('\n\n');
        return send(sock, chatId, message, `🇵🇰 *Pakistan Update*\n\n${lines}`);
      } catch (error) {
        console.error('[PKNEWS] Source failure:', error.message);
        return send(sock, chatId, message, '⚠️ Pakistan news sources temporarily unavailable. کوئی headline فرضی طور پر نہیں بنائی گئی۔');
      }
    },
  },
  {
    command: 'pkcurrency',
    aliases: ['pakcurrency'],
    category: 'info',
    description: 'Current exchange rates against PKR',
    usage: '-pkcurrency',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      try {
        const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 15000 });
        const rates = response.data?.rates;
        if (!rates?.PKR) throw new Error('PKR rate missing');
        const pairs = ['USD', 'EUR', 'GBP', 'SAR', 'AED'];
        const lines = pairs.filter(code => Number.isFinite(rates[code])).map(code => {
          const pkr = code === 'USD' ? rates.PKR : rates.PKR / rates[code];
          return `${code} → PKR ${pkr.toFixed(2)}`;
        });
        if (!lines.length) throw new Error('No supported rates');
        return send(sock, chatId, message, `💱 *PKR Currency Rates*\n\n${lines.join('\n')}\n\n📡 Source: open.er-api.com\n🕒 Timestamp: ${new Date().toLocaleString()}`);
      } catch (error) {
        console.error('[PKCURRENCY] Source failure:', error.message);
        return send(sock, chatId, message, '⚠️ Currency source temporarily unavailable. Stale یا اندازاً rate نہیں دکھائی گئی۔');
      }
    },
  },
];
