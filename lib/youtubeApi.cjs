"use strict";

const axios = require("axios");

const ENDPOINT = process.env.YOUTUBE_DOWNLOADER_API_URL ||
  "https://ytb-downloader-api.vercel.app/ytb";
const MAX_BYTES = Number(process.env.YOUTUBE_MAX_DOWNLOAD_BYTES || 100 * 1024 * 1024);

function normalizeQuality(value, fallback = "480p") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "mp3" || raw === "audio") return "mp3";
  if (/^\d+$/.test(raw)) return `${raw}p`;
  if (/^\d+p$/.test(raw)) return raw;
  return fallback;
}

function isYouTubeUrl(value) {
  try {
    const host = new URL(String(value).trim()).hostname.toLowerCase();
    return host === "youtube.com" || host === "www.youtube.com" ||
      host === "m.youtube.com" || host === "youtu.be" || host === "www.youtu.be" ||
      host.endsWith(".youtube.com");
  } catch { return false; }
}

function buildApiUrl(videoUrl, type = "480p") {
  const u = new URL(ENDPOINT);
  u.searchParams.set("url", String(videoUrl).trim());
  u.searchParams.set("type", normalizeQuality(type));
  return u.toString();
}

function looksLikeMediaUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  if (/^(https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(value)) return false;
  return true;
}

function collectMediaUrls(value, out = [], depth = 0) {
  if (depth > 5 || out.length >= 20 || value == null) return out;
  if (typeof value === "string") {
    if (looksLikeMediaUrl(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    const priority = ["downloadUrl", "download_url", "download", "url", "link", "fileUrl", "file_url", "videoUrl", "video_url", "audioUrl", "audio_url", "streamUrl", "stream_url"];
    for (const key of priority) if (key in value) collectMediaUrls(value[key], out, depth + 1);
    for (const [key, item] of Object.entries(value)) {
      if (priority.includes(key)) continue;
      collectMediaUrls(item, out, depth + 1);
    }
  }
  return out;
}

function extractTitle(payload, fallback = "YouTube") {
  const candidates = [payload?.title, payload?.data?.title, payload?.result?.title, payload?.metadata?.title, payload?.data?.metadata?.title];
  return candidates.find((x) => typeof x === "string" && x.trim())?.trim() || fallback;
}

function parseApiPayload(buffer, contentType) {
  const text = Buffer.from(buffer).toString("utf8").trim();
  if (/json/i.test(String(contentType || "")) || text.startsWith("{") || text.startsWith("[")) {
    try { return JSON.parse(text); } catch {}
  }
  return null;
}

async function getResponse(url, timeout = 180000) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json,video/*,audio/*,*/*" },
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length > MAX_BYTES) throw new Error("YOUTUBE_FILE_TOO_LARGE");
  const contentType = response.headers?.["content-type"] || "";
  return { payload: parseApiPayload(buffer, contentType), buffer, contentType };
}

async function downloadYouTubeMedia(videoUrl, type = "480p", options = {}) {
  const quality = normalizeQuality(type);
  const apiUrl = buildApiUrl(videoUrl, quality);
  const api = await getResponse(apiUrl, options.timeoutMs || 180000);
  const fallbackTitle = options.title || "YouTube";

  if (!api.payload && /(video|audio|octet-stream)/i.test(api.contentType)) {
    return { buffer: api.buffer, title: fallbackTitle, type: quality === "mp3" ? "audio" : "video", quality, mediaUrl: null, apiUrl, contentType: api.contentType };
  }
  if (!api.payload) throw new Error("YOUTUBE_API_INVALID_RESPONSE");
  if (api.payload?.success === false || api.payload?.ok === false) {
    throw new Error(api.payload?.message || api.payload?.error || "YOUTUBE_API_FAILED");
  }

  const mediaUrls = [...new Set(collectMediaUrls(api.payload))];
  if (!mediaUrls.length) throw new Error("YOUTUBE_API_NO_DOWNLOAD_URL");
  let lastError;
  for (const mediaUrl of mediaUrls) {
    try {
      const media = await getResponse(mediaUrl, options.mediaTimeoutMs || 300000);
      if (media.payload && /json/i.test(media.contentType)) continue;
      return { buffer: media.buffer, title: extractTitle(api.payload, fallbackTitle), type: quality === "mp3" ? "audio" : "video", quality, mediaUrl, apiUrl, contentType: media.contentType };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("YOUTUBE_MEDIA_DOWNLOAD_FAILED");
}

module.exports = { ENDPOINT, MAX_BYTES, normalizeQuality, isYouTubeUrl, buildApiUrl, downloadYouTubeMedia };
