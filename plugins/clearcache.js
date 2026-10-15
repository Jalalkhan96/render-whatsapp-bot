const fs = require('fs');
const path = require('path');
const os = require('os');
const { isOwner } = require('../lib/isOwner');

// A selection of random fun GIFs/images for non-owners
const FUN_MEDIA = [
  'https://media.giphy.com/media/l41YtZOb9EUABnuqA/giphy.gif',
  'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
  'https://media.giphy.com/media/HhWpLfVDqT0w8/giphy.gif',
  'https://media.giphy.com/media/Ju7l5y9osyymQ/giphy.gif', // Rick roll
  'https://media.giphy.com/media/11ISwbgCxEzMyY/giphy.gif', // You have no power here
];

module.exports = {
  command: 'clearcache',
  aliases: ['clearstorage'],
  description: 'Owner only: Clears bot temp files to free up disk space.',
  async handler(sock, message) {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const sender = message.key.participant || message.key.remoteJid;
    const ownerStatus = await isOwner(sender, sock);

    if (!ownerStatus) {
      // Not owner -> Send random meme/gif
      const randomUrl = FUN_MEDIA[Math.floor(Math.random() * FUN_MEDIA.length)];
      return sock.sendMessage(from, {
        video: { url: randomUrl },
        gifPlayback: true,
        caption: 'Nice try! You do not have permission to clear the cache. 😂'
      }, { quoted: message });
    }

    // Is owner -> Proceed with cleanup
    await sock.sendMessage(from, { text: '🗑️ *Scanning temp directories...*' }, { quoted: message });

    const dirsToClean = [
        path.join(os.tmpdir(), 'abix-gdl'),
        path.join(os.tmpdir(), 'abix-bgr'),
        path.join(os.tmpdir(), 'abix-sticker'),
        path.join(os.tmpdir(), 'abix-media'),
    ];

    let freedBytes = 0;
    let fileCount = 0;

    for (const dir of dirsToClean) {
        try {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir);
            for (const file of files) {
                try {
                    const full = path.join(dir, file);
                    freedBytes += (fs.statSync(full).size || 0);
                    fs.rmSync(full, { recursive: true, force: true });
                    fileCount++;
                } catch (e) {
                    // Ignore individual file errors
                }
            }
        } catch (e) {
            // Ignore dir errors
        }
    }

    const mb = (freedBytes / 1024 / 1024).toFixed(2);
    const resultMsg = `✅ *Storage Cleaned Successfully!*\n\n` +
                      `🧹 Files removed: *${fileCount}*\n` +
                      `💾 Space freed: *${mb} MB*`;

    return sock.sendMessage(from, { text: resultMsg }, { quoted: message });
  }
};
