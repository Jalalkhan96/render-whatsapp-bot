const { news } = require('../infoscrap');
module.exports = {
  command: 'paknews',
  aliases: ['newsinfo', 'latestpaknews'],
  category: 'info',
  description: 'Pakistan, province, district and breaking news',
  usage: '.paknews pakistan|breaking|province Punjab|district Lahore',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const kind = (args[0] || 'pakistan').toLowerCase();
    const city = args.slice(1).join(' ');
    try {
      const result = await news(kind, city);
      const text = result.items.map((item, index) => `${index + 1}. *${item.title}*\n${item.link}`).join('\n\n');
      await sock.sendMessage(chatId, { text: `📰 *${result.label}*\n\n${text || 'No recent news found.'}` }, { quoted: message });
    } catch (error) {
      console.error('Pakistan news scrape failed:', error);
      await sock.sendMessage(chatId, { text: `❌ News source unavailable.\n\n_${error.message}_` }, { quoted: message });
    }
  }
};
