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

module.exports = {
  command: 'redditmeme',
  aliases: ['rmeme', 'reddit', 'dankmeme'],
  category: 'fun',
  description: 'Get a random meme from Reddit',
  usage: '.rmeme',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

      // The meme-api.com API fetches from popular meme subreddits on Reddit
      const res = await axios.get('https://meme-api.com/gimme', { timeout: 15000 });
      const data = res.data;

      if (!data || !data.url) {
        throw new Error('No image URL');
      }

      const caption =
        `╭───「 🤣 *REDDIT MEME* 🤣 」\n` +
        `│\n` +
        `│ 📝 *Title:* ${data.title}\n` +
        `│ 🌐 *Subreddit:* r/${data.subreddit}\n` +
        `│ 👍 *Upvotes:* ${data.ups?.toLocaleString() || 'N/A'}\n` +
        `│\n` +
        `╰───「 ✨ ABIX-AE 」`;

      await sock.sendMessage(chatId, {
        image: { url: data.url },
        caption,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
      console.error('Reddit meme error:', err.message);
      await sock.sendMessage(chatId, {
        text: '😅 Reddit walon ne meme chupaa diye hain, thodi der baad aana!',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};
