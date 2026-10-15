const { allDl, fetchMedia, chooseVideo, chooseAudio, platformFor, safeFileName } = require('../lib/abixDownloader');

async function run(sock, message, args, context, command, label) {
  const jid = context.chatId || message.key.remoteJid;
  const prefix = context.prefix || '.';
  const raw = args.join(' ').trim();
  const url = (raw.match(/https?:\/\/[^\s<>]+/i) || [])[0];
  if (!url) {
    return sock.sendMessage(jid, {
      text: `📥 *${label.toUpperCase()} DOWNLOADER*\n\n${prefix}${command} <url> [audio|video]`
    }, { quoted: message });
  }

  const audio = /\baudio\b/i.test(raw);
  try {
    await sock.sendMessage(jid, { react: { text: '⏳', key: message.key } });
    const info = await allDl(url);
    const mediaUrl = audio ? chooseAudio(info) : chooseVideo(info);
    if (!mediaUrl) throw new Error(`${audio ? 'Audio' : 'Video'} is not available for this link.`);
    const media = await fetchMedia(mediaUrl);
    const base = safeFileName(info.title, label.toLowerCase());

    if (audio) {
      await sock.sendMessage(jid, {
        audio: media.buffer,
        mimetype: media.contentType.includes('mpeg') ? 'audio/mpeg' : 'audio/mp4',
        fileName: `${base}.${media.contentType.includes('mpeg') ? 'mp3' : 'm4a'}`,
        caption: `🎧 *${info.title || label}*\n🌐 ${info.platform || platformFor(url)}\n💠 ABIX AllDL`
      }, { quoted: message });
    } else {
      await sock.sendMessage(jid, {
        video: media.buffer,
        mimetype: media.contentType.includes('webm') ? 'video/webm' : 'video/mp4',
        fileName: `${base}.mp4`,
        caption: `🎬 *${info.title || label}*\n🌐 ${info.platform || platformFor(url)}\n💠 ABIX AllDL`
      }, { quoted: message });
    }
    await sock.sendMessage(jid, { react: { text: '✅', key: message.key } });
  } catch (error) {
    console.error(`[ABIX ${command}]`, error);
    await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
    await sock.sendMessage(jid, { text: `❌ ${label} download failed.\n\n_${error.message}_` }, { quoted: message });
  }
}

module.exports = [
  { command: 'capcut', aliases: ['capcutdl'], category: 'download', description: 'CapCut downloader via ABIX', async handler(sock, msg, args, c) { return run(sock, msg, args, c, 'capcut', 'CapCut'); } },
  { command: 'redditdl', aliases: ['reddownload'], category: 'download', description: 'Reddit downloader via ABIX', async handler(sock, msg, args, c) { return run(sock, msg, args, c, 'redditdl', 'Reddit'); } },
  { command: 'sounddl', aliases: ['scdl'], category: 'download', description: 'SoundCloud downloader via ABIX', async handler(sock, msg, args, c) { return run(sock, msg, args, c, 'sounddl', 'SoundCloud'); } },
  { command: 'douyindl', aliases: ['douyin'], category: 'download', description: 'Douyin downloader via ABIX', async handler(sock, msg, args, c) { return run(sock, msg, args, c, 'douyindl', 'Douyin'); } }
];
