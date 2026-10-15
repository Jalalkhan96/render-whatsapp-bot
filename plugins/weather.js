const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

module.exports = {
  command: 'weather',
  aliases: ['forecast', 'climate'],
  category: 'info',
  description: 'Get the current weather for a specific city!',
  usage: '.weather <city>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const city = args.join(' ').trim();

    if (!city) {
      return await sock.sendMessage(chatId, {
        text: "❌ Bhai location ka naam ya IP toh likho! (e.g. .weather Lahore)",
        ...channelInfo
      }, { quoted: message });
    }

    try {
      const apiKey = '060a6bcfa19809c2cd4d97a212b19273';
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`);
      const weather = response.data;

      const weatherText = 
        `╭─「 ⛅ *WEATHER INFO* 」\n` +
        `│ 🌆 *Mausam e Haal:* ${weather.name}, ${weather.sys.country}\n` +
        `│ ☁️ *View:* ${weather.weather[0].description.toUpperCase()}\n` +
        `│ 🌡️ *Current Temp:* ${weather.main.temp}°C\n` +
        `│ 📉 *Min Temp:* ${weather.main.temp_min}°C\n` +
        `│ 📈 *Max Temp:* ${weather.main.temp_max}°C\n` +
        `│ 💧 *Humidity:* ${weather.main.humidity}%\n` +
        `│ 🌬️ *Wind Speed:* ${weather.wind.speed} km/h\n` +
        `╰───────────────○`;

      await sock.sendMessage(chatId, {
        text: weatherText,
        ...channelInfo
      }, { quoted: message });

    } catch (error) {
      console.error('Weather plugin error:', error.message);
      await sock.sendMessage(chatId, {
        text: 'Oops! 😅 Mausam ka haal batane wala abhi chhutti pe hai ya jagah ka naam ghalat hai!',
        ...channelInfo
      }, { quoted: message });
    }
  }
};
