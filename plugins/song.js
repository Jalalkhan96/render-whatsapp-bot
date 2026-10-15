"use strict";

const yts = require("yt-search");
const { downloadYouTubeMedia, isYouTubeUrl } = require("../lib/youtubeApi.cjs");

async function resolve(input) {
  if (isYouTubeUrl(input)) return { url: input, title: "YouTube song" };
  const result = await yts(input);
  const video = result?.videos?.[0];
  if (!video?.url) throw new Error("No YouTube result found.");
  return { url: video.url, title: video.title || "YouTube song" };
}

module.exports = {
  command: "song",
  aliases: ["music", "mp3"],
  category: "music",
  description: "Download YouTube song as MP3 using ytb-downloader-api",
  usage: "-song <song name | YouTube URL>",
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || "-";
    const input = args.map(String).join(" ").trim();
    if (!input) return sock.sendMessage(chatId, { text: `🎵 *Song Downloader*\n\nUsage: ${prefix}song <song name | YouTube link>` }, { quoted: message });
    try {
      const target = await resolve(input);
      await sock.sendMessage(chatId, { text: `🎵 Downloading MP3: *${target.title}*…` }, { quoted: message });
      const media = await downloadYouTubeMedia(target.url, "mp3", { title: target.title });
      const safe = String(media.title || target.title).replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "song";
      await sock.sendMessage(chatId, { audio: media.buffer, mimetype: "audio/mpeg", fileName: `${safe}.mp3`, ptt: false }, { quoted: message });
    } catch (error) {
      console.error("[SONG]", error);
      await sock.sendMessage(chatId, { text: `❌ *Song download failed*\n\n${error.message || error}` }, { quoted: message });
    }
  },
};
