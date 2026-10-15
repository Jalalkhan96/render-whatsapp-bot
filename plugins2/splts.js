'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const core = require('./spotify-core.cjs');

module.exports = {
  command: 'splts',
  aliases: [],
  category: 'spotify-tools',
  description: 'Send every available official Spotify preview in a playlist one by one',
  usage: '-splts <playlist URL or name>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    const input = Array.isArray(args) ? args.join(' ').trim() : String(args || '').trim();
    if (!input) return sock.sendMessage(chatId, { text: 'Usage: -splts <Spotify playlist URL or playlist name>' }, { quoted: message });
    const status = await sock.sendMessage(chatId, { text: '📥 Fetching playlist and preparing preview files…' }, { quoted: message });
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'abix-splts-'));
    try {
      const data = await core.scrapePlaylist(input);
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      let sent = 0;
      let skipped = 0;
      for (let i = 0; i < data.tracks.length; i++) {
        const track = data.tracks[i];
        if (!track.preview_url) { skipped++; continue; }
        const file = path.join(dir, `${String(i + 1).padStart(3, '0')}-${core.safeName(`${track.title} - ${track.artists}`, 75)}.mp3`);
        try {
          await core.downloadFile(track.preview_url, file);
          const buffer = await fs.promises.readFile(file);
          await sock.sendMessage(chatId, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: path.basename(file),
            caption: `🎵 ${i + 1}/${data.total}\n${track.title}\n🎤 ${track.artists}\n⏱️ ${track.duration}\n\nOfficial Spotify preview sample`,
          });
          sent++;
        } catch {
          skipped++;
        } finally {
          try { await fs.promises.unlink(file); } catch { /* ignore */ }
        }
        // Avoid hammering the remote service and keep memory flat.
        await new Promise(r => setTimeout(r, 250));
      }
      return sock.sendMessage(chatId, {
        text: `✅ *${core.cleanText(data.name, 90)}*\n\nPreview files sent: ${sent}\nSkipped/unavailable: ${skipped}\nTotal tracks: ${data.total}\n\nOnly Spotify-provided official preview samples are sent.`,
      });
    } catch (err) {
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      return sock.sendMessage(chatId, { text: `❌ Spotify playlist send failed.\n\n${core.cleanText(err.message, 400)}` }, { quoted: message });
    } finally {
      try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  },
};
