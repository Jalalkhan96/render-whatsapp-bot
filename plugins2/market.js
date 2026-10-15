const { exchangeRates, marketPrices } = require('../infoscrap');
function money(value) { return value ? `PKR ${Number(value).toFixed(2)}` : 'unavailable'; }
module.exports = {
  command: 'market',
  aliases: ['rates', 'prices'],
  category: 'info',
  description: 'PKR exchange, gold, silver and fuel prices',
  usage: '.market rates|prices',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      if ((args[0] || 'rates').toLowerCase() === 'prices') {
        const prices = await marketPrices();
        const text = Object.entries(prices).map(([key, value]) => `• *${key.toUpperCase()}:* ${value.price || value.error || 'unavailable'}\n  ${value.source}`).join('\n');
        return sock.sendMessage(chatId, { text: `💰 *PAKISTAN MARKET PRICES*\n\n${text}` }, { quoted: message });
      }
      const rates = await exchangeRates();
      const text = Object.entries(rates).filter(([key]) => key !== 'fetchedAt').map(([key, value]) => `• *${key}/PKR:* ${money(value)}`).join('\n');
      await sock.sendMessage(chatId, { text: `💱 *CURRENCY RATES*\n\n${text}\n\n_Source: ExchangeRate API_` }, { quoted: message });
    } catch (error) {
      console.error('Market scrape failed:', error);
      await sock.sendMessage(chatId, { text: `❌ Market data unavailable.\n\n_${error.message}_` }, { quoted: message });
    }
  }
};
