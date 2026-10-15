const axios = require('axios');

module.exports = {
  command: 'geodata',
  aliases: ['geo', 'location'],
  category: 'search',
  description: 'Search for geolocation data for an IP or city name',
  usage: '.geodata <city or IP>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      return await sock.sendMessage(chatId, { text: '❌ Bhai location ka naam ya IP toh likho! (e.g. .geodata Lahore)' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '🌍 *Dhoond raha hoon, zara sabar...*' }, { quoted: message });

    try {
      // First try as IP using ip-api
      let isIp = /^[0-9\.]+$/.test(query);
      let info = '';

      if (isIp) {
        const res = await axios.get(`http://ip-api.com/json/${query}?fields=status,message,country,regionName,city,zip,isp,lat,lon,query`);
        if (res.data.status === 'fail') throw new Error('IP fail');
        const data = res.data;
        info = `
🌍 *GeoData Results (IP)*
---
📍 *Target:* ${data.query}
🏳️ *Country:* ${data.country}
🏙️ *City/Region:* ${data.city}, ${data.regionName}
📮 *Zip:* ${data.zip}
🗺️ *Coords:* ${data.lat}, ${data.lon}
📡 *ISP:* ${data.isp}
        `.trim();
      } else {
        // Use geocode.maps.co for city search
        const res = await axios.get(`https://geocode.maps.co/search?q=${encodeURIComponent(query)}`);
        if (!res.data || res.data.length === 0) throw new Error('Not found');
        const data = res.data[0];
        info = `
🌍 *GeoData Results (Location)*
---
📍 *Name:* ${data.display_name}
🗺️ *Lat:* ${data.lat}
🗺️ *Lon:* ${data.lon}
🗂️ *Class:* ${data.class} (${data.type})
        `.trim();
      }

      await sock.sendMessage(chatId, { text: info }, { quoted: message });

    } catch (err) {
      console.log('Geodata error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Server nakhray kar raha hai, thodi der baad try karo!' }, { quoted: message });
    }
  }
};
