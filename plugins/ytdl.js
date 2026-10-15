"use strict";
const yts = require("yt-search");
const { downloadYouTubeMedia, normalizeQuality, isYouTubeUrl } = require("../lib/youtubeApi.cjs");

async function resolve(input) {
  if (isYouTubeUrl(input)) return { url: input, title: "YouTube" };
  const result = await yts(input); const video = result?.videos?.[0];
  if (!video?.url) throw new Error("No YouTube result found.");
  return { url: video.url, title: video.title || "YouTube" };
}

module.exports = {
  command: "ytdl", aliases: ["youtube-dl"], category: "download",
  description: "YouTube video/audio downloader using ytb-downloader-api",
  usage: "-ytdl [480|780|mp3] <query or YouTube URL>",
  async handler(sock, message, args = [], context = {}) {
    const chatId=context.chatId||message.key.remoteJid, prefix=context.prefix||"-";
    const list=args.map(String); let type="480p";
    if (list[0] && /^(?:mp3|audio|\d+p?|\d+)$/.test(list[0].toLowerCase())) type=normalizeQuality(list.shift(),"480p");
    const input=list.join(" ").trim();
    if(!input) return sock.sendMessage(chatId,{text:`Usage: ${prefix}ytdl [480|780|mp3] <query or YouTube URL>`},{quoted:message});
    try{
      const target=await resolve(input); await sock.sendMessage(chatId,{text:`⏳ Downloading *${target.title}* as *${type}*…`},{quoted:message});
      const media=await downloadYouTubeMedia(target.url,type,{title:target.title});
      const safe=String(media.title||target.title).replace(/[<>:"/\\|?*\x00-\x1F]/g," ").replace(/\s+/g," ").trim().slice(0,80)||"youtube";
      if(media.type==="audio") await sock.sendMessage(chatId,{audio:media.buffer,mimetype:"audio/mpeg",fileName:`${safe}.mp3`,ptt:false},{quoted:message});
      else await sock.sendMessage(chatId,{video:media.buffer,mimetype:"video/mp4",fileName:`${safe}.mp4`,caption:`🎬 *${safe}*\n📺 ${media.quality}`},{quoted:message});
    }catch(error){console.error("[YTDL]",error);await sock.sendMessage(chatId,{text:`❌ *YouTube download failed*\n\n${error.message||error}`},{quoted:message});}
  },
};
