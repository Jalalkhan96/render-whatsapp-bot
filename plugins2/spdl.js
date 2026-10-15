'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('./spotify-core.cjs');

module.exports = {
  command: 'spdl',
  aliases: ['spdownload'],
  category: 'spotify-tools',
  description: 'Send an official Spotify 30-second preview from a -sp search result',
  usage: '-spdl <token> <1-5>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    const state = core.getSession(args[0], chatId);
    const n = Number(args[1]);
    if (!state) return sock.sendMessage(chatId, { text: '❌ This Spotify search expired. Run -sp again.' }, { quoted: message });
    if (!Number.isInteger(n) || n < 1 || n > state.items.length) {
      return sock.sendMessage(chatId, { text: `❌ Choose a result from 1-${state.items.length}.` }, { quoted: message });
    }
    const track = state.items[n - 1];
    if (!track.preview_url) {
      return sock.sendMessage(chatId, { text: `ℹ️ No official Spotify preview is available for:\n${track.title} — ${track.artists}\n\n🔗 ${track.url || ''}` }, { quoted: message });
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'abix-sp-'));
    const file = path.join(dir, `${core.safeName(`${track.title} - ${track.artists}`, 80)}.mp3`);
    try {
      await core.downloadFile(track.preview_url, file);
      const buffer = await fs.promises.readFile(file);
      return sock.sendMessage(chatId, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: path.basename(file),
        caption: `🎵 ${track.title}\n🎤 ${track.artists}\n⏱️ ${track.duration}\n\nSpotify official preview sample`,
      }, { quoted: message });
    } catch (err) {
      return sock.sendMessage(chatId, { text: `❌ Preview download failed.\n\n${core.cleanText(err.message, 250)}` }, { quoted: message });
    } finally {
      try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  },
};
