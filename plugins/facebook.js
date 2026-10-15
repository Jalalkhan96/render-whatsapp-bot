const { allDl, fetchMedia, chooseVideo, chooseAudio, platformFor, safeFileName } = require('../lib/abixDownloader');

module.exports = {
  command: "facebook",
  aliases: ["fbdl"],
  category: 'download',
  description: 'Facebook downloader via ABIX',
  usage: '.facebook <url> [audio|video]',
  async handler(sock, message, args, context={}) {
    const jid=context.chatId||message.key.remoteJid;
    const input=String(args.join(' ')||'').trim();
    const url=(input.match(/https?:\/\/[^\s<>]+/i)||[])[0];
    if (!url) return sock.sendMessage(jid, {text:`📥 *FACEBOOK DOWNLOADER*\n\nUsage: ${context.prefix||'.'}facebook <url> [audio|video]\nExample: https://www.facebook.com/watch/?v=123`}, {quoted:message});
    const kind=/\baudio\b/i.test(input) ? 'audio' : 'video';
    try {
      await sock.sendMessage(jid,{react:{text:'⏳',key:message.key}});
      const info=await allDl(url);
      const mediaUrl=kind==='audio'?chooseAudio(info):chooseVideo(info);
      if (!mediaUrl) throw new Error(`${kind} URL not available from ABIX.`);
      const media=await fetchMedia(mediaUrl);
      const base=safeFileName(info.title,'Facebook');
      if (kind==='audio') await sock.sendMessage(jid,{audio:media.buffer,mimetype:media.contentType.includes('mpeg')?'audio/mpeg':'audio/mp4',fileName:`${base}.${media.contentType.includes('mpeg')?'mp3':'m4a'}`,caption:`🎧 *${info.title||'Facebook'}*\n🌐 ${info.platform||platformFor(url)}`},{quoted:message});
      else await sock.sendMessage(jid,{video:media.buffer,mimetype:media.contentType.includes('webm')?'video/webm':'video/mp4',fileName:`${base}.mp4`,caption:`🎬 *${info.title||'Facebook'}*\n🌐 ${info.platform||platformFor(url)}`},{quoted:message});
      await sock.sendMessage(jid,{react:{text:'✅',key:message.key}});
    } catch(e) {
      console.error('[ABIX facebook]',e);
      await sock.sendMessage(jid,{react:{text:'❌',key:message.key}}).catch(()=>{});
      await sock.sendMessage(jid,{text:`❌ Download failed.\n_${e.message||'ABIX did not return media.'}_`},{quoted:message});
    }
  }
};
