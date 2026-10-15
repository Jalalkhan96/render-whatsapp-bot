"use strict";

const yts = require("yt-search");
const { downloadYouTubeMedia, normalizeQuality, isYouTubeUrl } = require("../lib/youtubeApi.cjs");

function parseArgs(args = []) {
  const list = Array.isArray(args) ? args.map(String) : [];
  let quality = "480p";
  if (list[0] && /^(?:mp3|audio|\d+p?|\d+)$/.test(list[0].toLowerCase())) quality = normalizeQuality(list.shift(), "480p");
  return { quality, input: list.join(" ").trim() };
}

async function resolveVideo(input) {
  if (isYouTubeUrl(input)) return { url: input, title: "YouTube video" };
  const result = await yts(input);
  const video = result?.videos?.[0];
  if (!video?.url) throw new Error("No YouTube videos found.");
  return { url: video.url, title: video.title || "YouTube video" };
}

module.exports = {
  command: "video",
  aliases: ["ytmp4"],
  category: "media",
  description: "Download YouTube video through ytb-downloader-api",
  usage: "-video [480|780] <query or YouTube URL>",
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || "-";
    const { quality, input } = parseArgs(args);
    if (!input) return sock.sendMessage(chatId, { text: `🎬 *VIDEO DOWNLOADER*\n\nUsage: ${prefix}video [480|780] <query or URL>\nExample: ${prefix}video 480 https://youtu.be/...` }, { quoted: message });
    try {
      const video = await resolveVideo(input);
      await sock.sendMessage(chatId, { text: `🎬 *${video.title}*\n⏳ Downloading ${quality}…` }, { quoted: message });
      const media = await downloadYouTubeMedia(video.url, quality, { title: video.title });
      if (media.type !== "video") throw new Error("Video API returned non-video media.");
      const safe = String(media.title || video.title).replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "video";
      await sock.sendMessage(chatId, { video: media.buffer, mimetype: "video/mp4", fileName: `${safe}.mp4`, caption: `🎬 *${safe}*\n📺 Quality: *${media.quality}*\n⚡ ytb-downloader-api` }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: "✅", key: message.key } }).catch(() => {});
    } catch (error) {
      console.error("[VIDEO]", error);
      await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } }).catch(() => {});
      await sock.sendMessage(chatId, { text: `❌ *Video failed*\n\n${error.message || error}` }, { quoted: message });
    }
  },
};
