const settings = require('../settings');
module.exports = {
  command: 'finmenu',
  aliases: ['finance', 'marketmenu'],
  category: 'info',
  description: 'Finance, rates, metals and fuel menu',
  usage: `${settings.prefixes[0]}finmenu`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, { text: `╭━━━〔 💰 *FINANCE* 〕━━━╮
┃ .market rates — USD/GBP/EUR/SAR/AED to PKR
┃ .market prices — Gold, silver, petrol, diesel
┃
┃ .weatherinfo Lahore — current weather
┃ .weatherinfo Lahore 7 — 7-day forecast
┃ .alert rain [city] — rain alert
┃ .alert heatwave — heatwave alert
┃ .alert flood — flood alert
┃ .alert fog — fog alert
┃ .alert earthquake — earthquake alert
┃
┃ .paknews pakistan — latest Pakistan news
┃ .paknews breaking — breaking news
┃ .paknews province Punjab — province news
┃ .paknews district Lahore — district news
┃ .paknews flood — flood/rain news
┃ .paknews earthquake — earthquake news
╰━━━━━━━━━━━━━━━━━━━━━━╯` }, { quoted: message });
  }
};
