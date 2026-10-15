const axios = require('axios');
const { getChannelInfo } = require('../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'adviceslip',
  aliases: ['adviceslipapi', 'dailyadvice', 'lifeadvice', 'studyadvice'],
  category: 'fun',
  description: 'Random life, study and daily advice',
  usage: '.adviceslip',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    
    

    try {
      const apiUrl = `https://api.adviceslip.com/advice`  ;
      const res = await axios.get(apiUrl, {
        timeout: 10000,
        headers: { Accept: 'application/json' }
      });

      const txt = res.data?.slip?.advice;
      if (typeof txt !== 'string' || !txt.trim()) {
        throw new Error('Advice API returned no advice');
      }

      const finalTxt = `╭───「 🌐 *ADVICESLIP* 」\n│\n│ ` + (txt || 'Result found!').replace(/\n/g, '\n│ ') + `\n│\n╰───「 ✨ ABIX AE 」`;

      await sock.sendMessage(chatId, {
        text: finalTxt,
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    } catch (err) {
      console.error('[ADVICESLIP] error:', err.message);
      await sock.sendMessage(chatId, {
        text: '😅 Advice ka professor abhi chai break par hai. Thori dair baad dobara try karein.',
        contextInfo: FAKE_FORWARD.contextInfo
      }, { quoted: message });
    }
  }
};
