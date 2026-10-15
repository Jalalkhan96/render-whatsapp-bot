'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('./spotify-core.cjs');

async function sendPlaylistFile(sock, jid, message, data) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'abix-splt-'));
  const file = path.join(dir, `${core.safeName(data.name, 65)}.txt`);
  try {
    await fs.promises.writeFile(file, core.playlistTxt(data), 'utf8');
    return await sock.sendMessage(jid, {
      document: await fs.promises.readFile(file),
      fileName: path.basename(file),
      mimetype: 'text/plain',
      caption: `📚 ${data.name}\n🎵 ${data.total} tracks\n\nFull playlist tracklist attached.`,
    }, { quoted: message });
  } finally {
    try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function sendTop5(sock, jid, message, data) {
  const tracks = data.tracks.slice(0, 5);
  if (!tracks.length) return false;
  let slider = null;
  try { slider = require('./pplib/slider.cjs'); } catch { /* fallback */ }
  if (!slider?.sendSlider) return false;
  const items = tracks.map((t, i) => ({
    title: `${i + 1}. ${t.title}`,
    body: [t.artists ? `🎤 ${t.artists}` : '', `⏱️ ${t.duration}`, t.preview_url ? '✅ Preview available' : 'ℹ️ No preview'].join('\n'),
    footer: 'Spotify Playlist • Top 5',
    imageUrl: t.cover || data.cover || 'https://www.google.com/s2/favicons?domain=spotify.com&sz=128',
    buttons: t.preview_url ? [] : [],
  }));
  try {
    return await slider.sendSlider(sock, jid, {
      bodyText: `📚 *${core.cleanText(data.name, 70)}*\n${data.total} tracks • Swipe → top 5`,
      footerText: 'Use -spltz for ZIP • -splts for sequential previews',
      items,
      maxCards: 5,
    });
  } catch { return false; }
}

module.exports = {
  command: 'splt',
  aliases: [],
  category: 'spotify-tools',
  description: 'Fetch a Spotify playlist or album from a URL or name and send the full tracklist file',
  usage: '-splt <playlist URL or name>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    const input = Array.isArray(args) ? args.join(' ').trim() : String(args || '').trim();
    if (!input) return sock.sendMessage(chatId, { text: 'Usage: -splt <Spotify playlist URL or playlist name>' }, { quoted: message });
    const status = await sock.sendMessage(chatId, { text: `🔎 Fetching Spotify playlist *${core.cleanText(input, 80)}*…` }, { quoted: message });
    try {
      const data = await core.scrapePlaylist(input);
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      await sendTop5(sock, chatId, message, data);
      return sendPlaylistFile(sock, chatId, message, data);
    } catch (err) {
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      return sock.sendMessage(chatId, { text: `❌ Spotify playlist fetch failed.\n\n${core.cleanText(err.message, 400)}` }, { quoted: message });
    }
  },
};
