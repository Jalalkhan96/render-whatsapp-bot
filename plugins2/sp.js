'use strict';

const core = require('./spotify-core.cjs');

async function sendText(sock, jid, text, message) {
  return sock.sendMessage(jid, { text }, { quoted: message });
}

async function sendSearchSlider(sock, jid, message, tracks, query, token) {
  let slider = null;
  try { slider = require('./pplib/slider.cjs'); } catch { /* fallback below */ }
  if (!slider?.sendSlider) return false;

  const items = tracks.slice(0, 5).map((t, i) => ({
    title: `${i + 1}. ${t.title}`,
    body: [
      t.artists ? `🎤 ${t.artists}` : '',
      t.duration ? `⏱️ ${t.duration}` : '',
      t.explicit ? '🔞 Explicit' : '',
    ].filter(Boolean).join('\n'),
    footer: 'Spotify • Top 5',
    imageUrl: t.cover || 'https://www.google.com/s2/favicons?domain=spotify.com&sz=128',
    buttons: [
      { text: '⬇️ PREVIEW', id: `-spdl ${token} ${i + 1}` },
      { text: '🔗 OPEN', id: `-spopen ${token} ${i + 1}` },
    ],
  }));

  try {
    return await slider.sendSlider(sock, jid, {
      bodyText: `🎵 *SPOTIFY SEARCH*\nQuery: *${core.cleanText(query, 70)}*\nSwipe → choose a song`,
      footerText: 'Top 5 • Spotify public results • Preview download',
      items,
      maxCards: 5,
    });
  } catch {
    return false;
  }
}

const command = {
  command: 'sp',
  aliases: [],
  category: 'spotify-tools',
  description: 'Search Spotify for a song and show top 5 results in a slider',
  usage: '-sp <song name>',
  async handler(sock, message, args = {}) {
    const chatId = message.key.remoteJid;
    const query = Array.isArray(args) ? args.join(' ').trim() : String(args || '').trim();
    if (!query) return sendText(sock, chatId, 'Usage: -sp <song name>\nExample: -sp ghani khan', message);

    const status = await sendText(sock, chatId, `🔎 Searching Spotify for *${core.cleanText(query, 80)}*…`, message);
    try {
      const result = await core.searchSpotify(query, 5);
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      const tracks = result.tracks.slice(0, 5);
      if (!tracks.length) return sendText(sock, chatId, `❌ No Spotify songs found for "${core.cleanText(query, 80)}".`, message);
      const token = core.createSession(chatId, tracks);
      const shown = await sendSearchSlider(sock, chatId, message, tracks, query, token);
      if (shown) return;

      const lines = tracks.map((t, i) => `${i + 1}. ${t.title}\n   ${t.artists} • ${t.duration}\n   ${t.url}`);
      return sendText(sock, chatId,
        `🎵 *SPOTIFY SEARCH*\nQuery: *${core.cleanText(query, 80)}*\n\n${lines.join('\n\n')}\n\n⬇️ Preview: -spdl ${token} 1-5`,
        message);
    } catch (err) {
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      return sendText(sock, chatId, `❌ Spotify search failed.\n\n${core.cleanText(err.message, 350)}`, message);
    }
  },
};

module.exports = command;
