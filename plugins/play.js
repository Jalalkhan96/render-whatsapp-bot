const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const { allDl, saveMedia, safeFileName } = require('../lib/abixDownloader');
const { sendButtons } = require('../lib/whatsappUiCompat');

const tempDir = path.join(__dirname, '../temp/play');
const pending = new Map();
const TTL = 20 * 60 * 1000;

function extractYoutubeId(url) {
  const m = String(url).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#&]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return m?.[1] || null;
}
function formatNumber(n) { return Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : 'Unknown'; }
function formatDuration(seconds, timestamp) {
  if (timestamp) return timestamp;
  const n = Number(seconds); if (!Number.isFinite(n) || n <= 0) return 'Unknown';
  const h = Math.floor(n/3600), m = Math.floor((n%3600)/60), s = n%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}
function cleanup(p) { setTimeout(() => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} }, 30000); }
function token() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`; }
function sweep() { const now=Date.now(); for (const [k,v] of pending) if(now-v.createdAt>TTL) pending.delete(k); }
setInterval(sweep, 5*60*1000).unref?.();

async function pick(sock, msg, from, video, prefix) {
  sweep();
  const id=token();
  pending.set(id,{createdAt:Date.now(),url:video.url,title:video.title||'YouTube',author:video.author?.name||'Unknown',thumbnail:video.thumbnail,views:formatNumber(video.views),duration:formatDuration(video.seconds,video.timestamp),usedAudio:false,usedVideo:false});
  const buttons=[
    {name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'🎧 AUDIO',id:`${prefix}play __button audio ${id}`})},
    {name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'🎬 VIDEO',id:`${prefix}play __button video ${id}`})},
  ];
  const body=`🎵 *${video.title||'YouTube'}*\n\n👤 *${video.author?.name||'Unknown'}*\n⏱️ ${formatDuration(video.seconds,video.timestamp)}\n👁️ ${formatNumber(video.views)}\n📺 ${video.url}\n\nChoose Audio or Video:`;
  return sendButtons(sock,from,{body,footer:'ABIX • ABIX Media Downloader',buttons,quoted:msg});
}

module.exports={
  command:'play',
  aliases:['song','plays','music','ytplay'],
  category:'media',
  description:'Search YouTube and download Audio or Video via ABIX',
  usage:'.play <song name | YouTube URL>',
  async handler(sock,message,args,context={}){
    const from=context.chatId||message.key.remoteJid;
    const prefix=context.prefix||'.';
    const input=args.join(' ').trim();
    if (!input) return sock.sendMessage(from,{text:`🎵 *PLAY*\n\n${prefix}play <song name | YouTube URL>\n${prefix}play <YouTube URL> video\n${prefix}play <YouTube URL> audio`},{quoted:message});

    if (args[0]==='__button') {
      const action=String(args[1]||'').toLowerCase(), id=args[2];
      const item=pending.get(id);
      if (!item || !['audio','video'].includes(action)) return;
      if (item[action === 'audio' ? 'usedAudio' : 'usedVideo']) {
        return sock.sendMessage(from,{text:`⚠️ ${action==='audio'?'Audio':'Video'} already sent for this selection.`},{quoted:message});
      }
      try { await sock.sendMessage(from,{react:{text:'⏳',key:message.key}}); } catch {}
      let filePath;
      try {
        const info=await allDl(item.url);
        const saved=await saveMedia(item.url,tempDir,info,action);
        filePath=saved.filePath;
        await sock.sendMessage(from, action==='audio' ? {audio:saved.buffer,mimetype:saved.contentType.includes('mpeg')?'audio/mpeg':'audio/mp4',fileName:`${safeFileName(item.title,'audio')}.${saved.contentType.includes('mpeg')?'mp3':'m4a'}`} : {video:saved.buffer,mimetype:'video/mp4',fileName:`${safeFileName(item.title,'video')}.mp4`,caption:`🎬 *${item.title}*\n👤 ${item.author}`},{quoted:message});
        try { await sock.sendMessage(from,{react:{text:'✅',key:message.key}}); } catch {}
        item[action === 'audio' ? 'usedAudio' : 'usedVideo']=true;
        if (item.usedAudio && item.usedVideo) pending.delete(id); else pending.set(id,item);
      } catch (e) {
        console.error('[PLAY ABIX]',e);
        try { await sock.sendMessage(from,{react:{text:'❌',key:message.key}}); } catch {}
        await sock.sendMessage(from,{text:`❌ ${action==='audio'?'Audio':'Video'} download failed.\n_${e.message}_`},{quoted:message});
      } finally { cleanup(filePath); }
      return;
    }

    try {
      await sock.sendMessage(from,{react:{text:'⏳',key:message.key}});
      const videoId=extractYoutubeId(input);
      let video;
      if (videoId) video=await yts({videoId});
      else { const result=await yts(input); video=result?.videos?.[0]; }
      if (!video?.url) throw new Error('No YouTube result found.');
      await pick(sock,message,from,video,prefix);
      await sock.sendMessage(from,{react:{text:'✅',key:message.key}}).catch(()=>{});
    } catch(e) {
      console.error('[PLAY]',e);
      await sock.sendMessage(from,{react:{text:'❌',key:message.key}}).catch(()=>{});
      await sock.sendMessage(from,{text:`❌ *Play failed!*\n\n${e.message||'YouTube search failed.'}`},{quoted:message});
    }
  }
};
