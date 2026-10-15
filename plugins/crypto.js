const axios = require('axios');

module.exports = {
  command: 'crypto',
  aliases: ['coin', 'price'],
  category: 'info',
  description: 'Get real-time cryptocurrency prices',
  usage: '.crypto <coin name> (e.g. .crypto bitcoin)',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const coin = args[0] ? args[0].toLowerCase() : null;

    if (!coin) {
      return await sock.sendMessage(chatId, { text: '❌ Bhai coin ka naam toh likho! (Jaise: .crypto bitcoin ya .crypto ethereum)' }, { quoted: message });
    }

    try {
      const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,pkr&include_24hr_change=true`);
      const data = res.data[coin];

      if (!data) {
        return await sock.sendMessage(chatId, { text: `❌ Mafi chahta hoon bhai, '${coin}' naam ka koi coin market mein nahi mila!` }, { quoted: message });
      }

      const usdPrice = data.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const pkrPrice = data.pkr.toLocaleString('en-PK', { style: 'currency', currency: 'PKR' });
      const change = data.usd_24h_change.toFixed(2);
      const trend = change >= 0 ? '📈 Profit' : '📉 Loss';

      const info = `
💰 *CRYPTO MARKET LIVE* 💰
---
🪙 *Coin:* ${coin.toUpperCase()}
💵 *Price (USD):* ${usdPrice}
🇵🇰 *Price (PKR):* ${pkrPrice}
${trend} *24h Change:* ${change}%

✨ *Powered by ABIX-AE*
      `.trim();

      await sock.sendMessage(chatId, { text: info }, { quoted: message });

    } catch (err) {
      console.log('Crypto error:', err.message);
      await sock.sendMessage(chatId, { text: 'Oops! 😅 Market crash ho gayi hai ya server so gaya hai, thodi der baad aana!' }, { quoted: message });
    }
  }
};
