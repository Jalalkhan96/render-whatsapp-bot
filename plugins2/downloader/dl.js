const axios = require('axios');
const { allDl, fetchMedia, chooseVideo, chooseAudio, platformFor } = require('../../lib/abixDownloader');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');
const FAKE_FORWARD = getChannelInfo();
const { providerForUrl } = require('../../lib/cloudFileResolver.cjs');
const filedl = require('../filedl');

const SUPPORTED_LIST = 'YouTube, TikTok, Instagram, Facebook, Twitter/X, Reddit, Snapchat, SoundCloud, CapCut, SnackVideo, Douyin, Google Drive, Dropbox, GoFile, MediaFire, Pixeldrain, GitHub release assets';

function isSupportedUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return (
      h.includes('youtube') || h === 'youtu.be' ||
      h.includes('tiktok') ||
      h.includes('instagram') ||
      h.includes('facebook') || h === 'fb.watch' ||
      h.includes('twitter') || h.includes('x.com') ||
      h.includes('reddit') || h === 'redd.it' ||
      h.includes('snapchat') ||
      h.includes('soundcloud') ||
      h.includes('capcut') ||
      h.includes('snackvideo') ||
      h.includes('douyin')
    );
  } catch { return false; }
}

module.exports = {
  command: 'dl',
  aliases: ['download', 'downloader', 'yt', 'ig', 'fb', 'tw', 'tt', 'sn', 'youtube', 'instagram', 'facebook', 'tiktok', 'twitter'],
  category: 'utility',
  description: 'Universal media downloader via ABIX',
  usage: '.dl <url> | .dl audio <url> | .dl info <url>',
  async handler(sock, message, args, context = {}) {
    const jid = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '.';
    const raw = args.join(' ').trim();
    const mode = /^(audio|video|info)\b/i.exec(raw)?.[1]?.toLowerCase() || 'video';
    const url = (raw.match(/https?:\/\/[^\s<>]+/i) || [])[0];

    if (!url) {
      return sock.sendMessage(jid, {
        text: `📥 *ABIX UNIVERSAL DOWNLOADER*\n\n${prefix}dl <url>\n${prefix}dl audio <url>\n${prefix}dl video <url>\n${prefix}dl info <url>\n\n✅ *Supported:*\n${SUPPORTED_LIST}\n\n💡 For direct file URLs use *${prefix}gdl <url>*`
      }, { quoted: message });
    }

    // Public cloud/file hosts use the dedicated streaming file downloader.
    const cloudProvider = providerForUrl(url);
    if (["Google Drive", "Dropbox", "GoFile", "MediaFire", "Pixeldrain", "GitHub", "Direct file URL"].includes(cloudProvider)) {
      return filedl._run(sock, message, [url], context);
    }

    // Check if URL is from a supported platform before hitting the API
    if (!isSupportedUrl(url)) {
      let platform = 'This site';
      try { platform = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      return sock.sendMessage(jid, {
        text: `❌ *${platform}* is not supported by *${prefix}dl*\n\n✅ *Supported platforms:*\n${SUPPORTED_LIST}\n\n💡 For direct file links (catbox, gofile, etc.) use:\n*${prefix}gdl ${url}*`
      }, { quoted: message });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: message.key } });
      const info = await allDl(url);

      if (mode === 'info') {
        const qualities = info.qualities?.map(q => `${q.quality || '?'} → ${q.url ? 'available' : '-'}`).join('\n') || 'Not listed';
        return sock.sendMessage(jid, {
          text: `📊 *MEDIA INFO*\n\n🎬 Title: *${info.title || 'Unknown'}*\n🌐 Platform: *${info.platform || platformFor(url)}*\n🔗 ${url}\n🎥 Video: ${info.videoUrl ? '✅' : '❌'}\n🎧 Audio: ${info.audioUrl ? '✅' : '❌'}\n\n*Qualities*\n${qualities}`
        }, { quoted: message });
      }

      const mediaUrl = mode === 'audio' ? chooseAudio(info) : chooseVideo(info);
      if (!mediaUrl) throw new Error(`${mode} URL unavailable.`);

      const media = await fetchMedia(mediaUrl);

      if (mode === 'audio') {
        await sock.sendMessage(jid, {
          audio: media.buffer,
          mimetype: media.contentType.includes('mpeg') ? 'audio/mpeg' : 'audio/mp4',
          fileName: `${info.title || 'audio'}.mp3`
        }, { quoted: message });
      } else {
        await sock.sendMessage(jid, {
          video: media.buffer,
          mimetype: media.contentType.includes('webm') ? 'video/webm' : 'video/mp4',
          fileName: `${info.title || 'video'}.mp4`,
          caption: `🎬 *${info.title || 'Video'}*\n🌐 ${info.platform || platformFor(url)}\n💠 ABIX AllDL`
        }, { quoted: message });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: message.key } });

    } catch (e) {
      console.error('[ABIX DL]', e);
      await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
      await sock.sendMessage(jid, {
        text: `❌ *Download failed*\n\n${e.message}\n\n${funnyError(e)}`,
        ...FAKE_FORWARD
      }, { quoted: message });
    }
  }
};
