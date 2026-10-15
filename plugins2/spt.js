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

async function fetchSpotifyPlaylist(url) {
  const api = `https://api.nexadev.my.id/api/spotifyplaylist?url=${encodeURIComponent(url)}`;
  const response = await axios.get(api, {
    timeout: 60000,
    headers: { 'User-Agent': 'ABIX-AE Spotify Playlist Bot', Accept: 'application/json' }
  });
  const data = response.data;
  if (!data?.status || (!data.result && !data.tracks)) throw new Error('Playlist API से data nahi mila');
  return data.result || data.tracks;
}

function safeFileName(title) {
  const cleanTitle = String(title || 'spotify-audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
  return `${cleanTitle || 'spotify-audio'}.mp3`;
}

module.exports = {
  command: 'spt',
  aliases: ['spotifyplaylist', 'sptdl'],
  category: 'downloader',
  description: 'Download full Spotify playlist and send songs one by one',
  usage: '.spt <Spotify Playlist URL>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const url = args[0];

    if (!url || !url.includes('spotify.com')) {
      return sock.sendMessage(chatId, {
        text: '🎵 *Spotify playlist ka link do!*\n\nExample: `.spt https://open.spotify.com/playlist/...`',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    try {
      console.log(`[SPOTIFY-PLAYLIST] 📥 Playlist fetch kar raha hoon: ${url}`);
      await sock.sendMessage(chatId, {
        text: '⏳ Spotify playlist load ho rahi hai... tracks fetch kiye ja rahe hain!',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      const tracks = await fetchSpotifyPlaylist(url);
      if (!Array.isArray(tracks) || tracks.length === 0) {
        throw new Error('Playlist mein koi tracks nahi mile ya invalid URL hai.');
      }

      await sock.sendMessage(chatId, {
        text: `✅ *Playlist Found!* Total *${tracks.length}* tracks mil gaye hain. Ab ek ek karke bhej raha hoon! 🎶`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const title = track.title || track.name || 'Unknown Track';
        const artist = track.artist || track.artists || 'Unknown Artist';
        const downloadUrl = track.download_url || track.url;

        if (!downloadUrl) continue;

        const caption = `╭━━━〔 🎵 *SPOTIFY TRACK (${i + 1}/${tracks.length})* 〕━━━╮\n┃\n┃ 📀 *Title:* ${title}\n┃ 🎤 *Artist:* ${artist}\n┃\n╰━━━〔 ✨ *${CHANNEL_NAME}* 〕━━━╯`;

        try {
          if (track.thumbnail) {
            await sock.sendMessage(chatId, {
              image: { url: track.thumbnail },
              caption,
              contextInfo: FAKE_FORWARD
            });
          }

          await sock.sendMessage(chatId, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mpeg',
            fileName: safeFileName(title),
            ptt: false,
            contextInfo: FAKE_FORWARD
          });

          // Delay between tracks to prevent flood/ban
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (err) {
          console.error(`[SPOTIFY-PLAYLIST] ❌ Track skip ho gaya (${title}): ${err.message}`);
        }
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      console.log(`[SPOTIFY-PLAYLIST] 🎉 Puri playlist bhej di gayi hai!`);
    } catch (error) {
      console.error(`[SPOTIFY-PLAYLIST] 😵 Error: ${error.message}`);
      await sock.sendMessage(chatId, {
        text: `😅 *Playlist download nahi ho saki!*\n\n🛠️ Wajah: ${error.message}`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
  }
};
