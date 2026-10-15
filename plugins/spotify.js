const axios = require('axios');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_NAME = process.env.NEWSLETTER_NAME || 'ABIX-AE';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: CHANNEL_NAME,
    serverMessageId: -1
  }
};

async function fetchSpotifyTrack(query) {
  const api = `https://api.nexadev.my.id/api/spotifyplay?q=${encodeURIComponent(query)}`;
  const response = await axios.get(api, {
    timeout: 45000,
    headers: { 'User-Agent': 'ABIX-AE Spotify Bot', Accept: 'application/json' }
  });
  const result = response.data?.result;
  if (!response.data?.status || !result) throw new Error('Gana API mein nahi mila');
  if (!result.download_url) throw new Error('API ne audio link nahi diya');
  return result;
}

function safeFileName(title) {
  const cleanTitle = String(title || 'spotify-audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
  return `${cleanTitle || 'spotify-audio'}.mp3`;
}

module.exports = {
  command: 'spotify',
  aliases: ['sp', 'spotifydl', 'spot'],
  category: 'downloader',
  description: 'Spotify song search and audio download',
  usage: '.spotify <song name or Spotify link>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = args.join(' ').trim();

    if (!input) {
      return sock.sendMessage(chatId, {
        text: '🎵 *Spotify ka naam batao!*\n\nExample: `.spotify Not Like Us`',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    try {
      console.log(`[SPOTIFY] 🎵 Gana dhoondh raha hoon: ${input}`);
      await sock.sendMessage(chatId, {
        text: '⏳ Spotify ka DJ file dhoondh raha hai... thoda beat par rukain!',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      const result = await fetchSpotifyTrack(input);
      const title = result.title || input;
      const caption = `╭━━━〔 🎵 *SPOTIFY PLAY* 〕━━━╮\n┃\n┃ 📀 *Title:* ${title}\n┃ 🎤 *Artist:* ${result.artist || 'Unknown'}\n┃ 💽 *Album:* ${result.album || 'Unknown'}\n┃ ⏱️ *Duration:* ${result.duration || 'Unknown'}\n┃ ⭐ *Popularity:* ${result.popularity || 'Unknown'}\n┃\n┃ ⏳ Audio aa rahi hai...\n┃\n╰━━━〔 ✨ *${CHANNEL_NAME}* 〕━━━╯`;

      if (result.thumbnail) {
        await sock.sendMessage(chatId, {
          image: { url: result.thumbnail },
          caption,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      await sock.sendMessage(chatId, {
        audio: { url: result.download_url },
        mimetype: 'audio/mpeg',
        fileName: safeFileName(title),
        ptt: false,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      console.log(`[SPOTIFY] ✅ Audio bhej diya: ${title}`);
    } catch (error) {
      console.error(`[SPOTIFY] 😵 DJ ne brake laga di: ${error.message}`);
      await sock.sendMessage(chatId, {
        text: `😅 *Spotify ka DJ so gaya!*\n\n🎵 Gana: *${input}*\n🛠️ Wajah: ${error.message}\n\nThodi der baad dobara try karein.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
  }
};
