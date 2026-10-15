const { weather } = require('../infoscrap');
module.exports = {
  command: 'weatherinfo',
  aliases: ['forecast7', 'cityweather'],
  category: 'info',
  description: 'Current weather and forecast by city',
  usage: '.weatherinfo Lahore [7]',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const city = args.filter(arg => !/^\d+$/.test(arg)).join(' ').trim();
    const days = Math.min(7, Math.max(1, Number(args.find(arg => /^\d+$/.test(arg))) || 1));
    if (!city) return sock.sendMessage(chatId, { text: '❌ Example: *.weatherinfo Lahore 7*' }, { quoted: message });
    try {
      const data = await weather(city, days);
      const current = data.current;
      const forecast = data.forecast.map(day => `• ${day.date}: ${day.mintempC}°C - ${day.maxtempC}°C, ${day.hourly?.[4]?.weatherDesc?.[0]?.value || 'forecast'}`).join('\n');
      await sock.sendMessage(chatId, { text: `🌦️ *WEATHER: ${data.city}*\n\n🌡️ ${current.temp_C}°C | ${current.weatherDesc?.[0]?.value}\n💧 Humidity: ${current.humidity}%\n💨 Wind: ${current.windspeedKmph} km/h\n\n${forecast}\n\n_Source: wttr.in_` }, { quoted: message });
    } catch (error) {
      console.error('Weather scrape failed:', error);
      await sock.sendMessage(chatId, { text: `❌ Weather unavailable.\n\n_${error.message}_` }, { quoted: message });
    }
  }
};
