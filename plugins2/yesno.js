const axios = require('axios');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbE7AW8GOj9rTFZnej0y';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

// Curated Yes/No GIFs to ensure variety on both sides
const YES_GIFS = [
  'https://media.tenor.com/JCVoJpMJGDYAAAAC/yes-nodding.gif',
  'https://media.tenor.com/dpfMZa9pMaYAAAAC/yes-smiling.gif',
  'https://media.tenor.com/NHZ4kGDG8jwAAAAC/yes-yeah.gif',
  'https://media.tenor.com/L_XO2B7pbXMAAAAC/sure-yes.gif',
  'https://media.tenor.com/zqPiE6Vr2LIAAAAC/yes-deal.gif'
];

const NO_GIFS = [
  'https://media.tenor.com/kq5ZKi0TnvYAAAAC/no-nope.gif',
  'https://media.tenor.com/sEANLz0oWuAAAAAC/no-nah.gif',
  'https://media.tenor.com/7CgvVJTFjLAAAAAC/no-no-no.gif',
  'https://media.tenor.com/1XA5yGUb0esAAAAC/jimmy-fallon-no.gif',
  'https://media.tenor.com/d8rJE4TQm-AAAAAC/no-thank-you-no.gif'
];

module.exports = {
  command: 'yesno',
  aliases: ['yesnoapi', 'yn'],
  category: 'fun',
  description: 'Get a random Yes or No answer',
  usage: '.yesno [question]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const question = args.join(' ').trim();

    try {
      const response = await axios.get('https://yesno.wtf/api', { timeout: 10000 });
      const apiAnswer = String(response.data?.answer || '').toUpperCase();
      const isYes = apiAnswer === 'YES' || (apiAnswer !== 'NO' && Math.random() < 0.5);
      const answer = isYes ? 'YES ✅' : 'NO ❌';
      const emoji = isYes ? '✅' : '❌';
      const gifList = isYes ? YES_GIFS : NO_GIFS;
      const gifUrl = response.data?.image || gifList[Math.floor(Math.random() * gifList.length)];
      const caption = `╭───「 ${emoji} *YES OR NO?* 」\n│\n│ ${question ? `❓ *Q:* ${question}\n│\n│ ` : ''}🎲 *Answer:* *${answer}*\n│\n╰───「 ✨ ABIX-AE 」`;

      await sock.sendMessage(chatId, {
        image: { url: gifUrl },
        caption,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    } catch (gifErr) {
      const isYes = Math.random() < 0.5;
      const caption = `╭───「 ${isYes ? '✅' : '❌'} *YES OR NO?* 」\n│\n│ ${question ? `❓ *Q:* ${question}\n│\n│ ` : ''}🎲 *Answer:* *${isYes ? 'YES ✅' : 'NO ❌'}*\n│\n╰───「 ✨ ABIX-AE 」`;
      await sock.sendMessage(chatId, { text: caption, contextInfo: FAKE_FORWARD }, { quoted: message });
    }
  }
};
