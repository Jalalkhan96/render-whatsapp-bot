'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const core = require('./spotify-core.cjs');

module.exports = {
  command: 'spltz',
  aliases: [],
  category: 'spotify-tools',
  description: 'Package a Spotify playlist into a ZIP with metadata and official previews',
  usage: '-spltz <playlist URL or name>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    const input = Array.isArray(args) ? args.join(' ').trim() : String(args || '').trim();
    if (!input) return sock.sendMessage(chatId, { text: 'Usage: -spltz <Spotify playlist URL or playlist name>' }, { quoted: message });
    const status = await sock.sendMessage(chatId, { text: '📦 Building Spotify playlist ZIP…\nOnly official preview samples are included where Spotify provides them.' }, { quoted: message });
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'abix-spltz-'));
    try {
      const data = await core.scrapePlaylist(input);
      const zip = await core.zipPlaylist(data, dir);
      const fileName = `${core.safeName(data.name, 70)}-spotify.zip`;
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      return sock.sendMessage(chatId, {
        document: zip,
        fileName,
        mimetype: 'application/zip',
        caption: `📦 ${data.name}\n🎵 ${data.total} tracks\n\nContains playlist metadata + available official Spotify preview samples.`,
      }, { quoted: message });
    } catch (err) {
      if (status?.key) { try { await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ } }
      return sock.sendMessage(chatId, { text: `❌ Spotify ZIP failed.\n\n${core.cleanText(err.message, 400)}` }, { quoted: message });
    } finally {
      try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  },
};
