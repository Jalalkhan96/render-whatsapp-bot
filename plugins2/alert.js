const { alerts } = require('../infoscrap');
module.exports = {
  command: 'alert',
  aliases: ['alerts', 'weatheralert'],
  category: 'info',
  description: 'Weather, flood, heatwave, fog and earthquake alerts',
  usage: '.alert rain [city]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const type = (args[0] || 'weather').toLowerCase();
    const city = args.slice(1).join(' ');
    try {
      const items = await alerts(type, city);
      const text = items.map((item, index) => `${index + 1}. *${item.title}*\n${item.url || ''}`).join('\n\n');
      await sock.sendMessage(chatId, { text: `🚨 *${type.toUpperCase()} ALERTS*\n\n${text || 'No recent alert found.'}` }, { quoted: message });
    } catch (error) {
      console.error('Alert scrape failed:', error);
      await sock.sendMessage(chatId, { text: `❌ Alert source unavailable.\n\n_${error.message}_` }, { quoted: message });
    }
  }
};
