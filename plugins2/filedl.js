"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");
const { pipeline } = require("stream/promises");
const {
  providerForUrl,
  resolveCloudFile,
  filenameFromHeaders,
  filenameFromUrl,
  safeFilename
} = require("../lib/cloudFileResolver.cjs");

const MAX_BYTES = Number(process.env.CLOUD_FILE_MAX_MB || 100) * 1024 * 1024;
const TIMEOUT = Number(process.env.CLOUD_FILE_TIMEOUT_MS || 15 * 60 * 1000);
const TMP_ROOT = path.join(process.env.TMPDIR || os.tmpdir(), "abix-cloud-dl");

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, value = bytes;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function mimeFor(filename, fallback) {
  const ext = path.extname(filename || "").toLowerCase();
  const map = {
    ".pdf": "application/pdf", ".zip": "application/zip", ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed", ".apk": "application/vnd.android.package-archive",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/opus", ".mp4": "video/mp4",
    ".mkv": "video/x-matroska", ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo"
  };
  return map[ext] || fallback || "application/octet-stream";
}

async function ensureTemp() { await fsp.mkdir(TMP_ROOT, { recursive: true }); }

async function ensureSpace(required) {
  try {
    const st = await fsp.statfs(TMP_ROOT);
    const free = Number(st.bavail) * Number(st.bsize);
    const safety = 128 * 1024 * 1024;
    if (required > free - safety) throw new Error(`Not enough disk space for this download. Need about ${formatBytes(required)}.`);
  } catch (e) {
    if (!e || !["ENOSYS", "ENOTSUP"].includes(e.code)) throw e;
  }
}

async function streamToDisk(url, suggested = null, knownSize = null, contentType = null, requestHeaders = {}) {
  await ensureTemp();
  if (Number.isFinite(knownSize) && knownSize > MAX_BYTES) {
    throw new Error(`File is too large (${formatBytes(knownSize)}). Current limit: ${formatBytes(MAX_BYTES)}.`);
  }
  if (Number.isFinite(knownSize) && knownSize > 0) await ensureSpace(knownSize);

  const response = await axios.get(url, {
    responseType: "stream",
    timeout: TIMEOUT,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    maxRedirects: 6,
    validateStatus: s => s >= 200 && s < 400,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ABIX-AE file downloader)", Accept: "*/*", ...requestHeaders }
  });

  const type = String(response.headers?.["content-type"] || contentType || "application/octet-stream").toLowerCase();
  if (type.includes("text/html")) {
    response.data.destroy();
    throw new Error("The host returned a web page instead of the file. The link may be private, expired, or not directly downloadable.");
  }

  const headerSize = Number(response.headers?.["content-length"] || 0);
  if (headerSize > MAX_BYTES) {
    response.data.destroy();
    throw new Error(`File is too large (${formatBytes(headerSize)}). Current limit: ${formatBytes(MAX_BYTES)}.`);
  }
  if (headerSize > 0) await ensureSpace(headerSize);

  const filename = safeFilename(filenameFromHeaders(response.headers) || suggested || filenameFromUrl(url) || "download.bin");
  const tempPath = path.join(TMP_ROOT, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${filename}`);
  let received = 0;
  response.data.on("data", chunk => {
    received += chunk.length;
    if (received > MAX_BYTES) response.data.destroy(new Error(`File exceeded ${formatBytes(MAX_BYTES)} while downloading.`));
  });
  try {
    await pipeline(response.data, fs.createWriteStream(tempPath, { flags: "wx" }));
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  if (!received) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw new Error("Downloaded file is empty.");
  }
  return { tempPath, filename, size: received, mimetype: mimeFor(filename, type) };
}

function usage(prefix) {
  return `📦 *ABIX FILE DOWNLOADER*\n\n` +
    `${prefix}filedl <link>\n` +
    `${prefix}gdrive <Google Drive link>\n` +
    `${prefix}dropbox <Dropbox link>\n` +
    `${prefix}gofile <GoFile link>\n` +
    `${prefix}pixeldrain <Pixeldrain link>\n\n` +
    `✅ Google Drive\n✅ Dropbox\n✅ GoFile\n✅ MediaFire\n✅ Pixeldrain\n✅ GitHub release assets\n✅ Direct file URLs\n\n` +
    `⚠️ Public/downloadable links only. Current file limit: ${formatBytes(MAX_BYTES)}`;
}

async function run(sock, message, args = [], context = {}) {
  const jid = context.chatId || message.key.remoteJid;
  const prefix = context.prefix || "-";
  const input = args.map(String).join(" ").match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!input) return sock.sendMessage(jid, { text: usage(prefix) }, { quoted: message });

  let info = null;
  try {
    const provider = providerForUrl(input);
    await sock.sendMessage(jid, { react: { text: "⏳", key: message.key } }).catch(() => {});
    await sock.sendMessage(jid, { text: `🔎 *${provider}* detected\n⏬ Resolving public file link...` }, { quoted: message });

    info = await resolveCloudFile(input);
    const file = await streamToDisk(info.url, info.filename, info.size, info.contentType, info.requestHeaders || {});

    await sock.sendMessage(jid, {
      document: { url: file.tempPath },
      fileName: file.filename,
      mimetype: file.mimetype,
      caption: `✅ *Download Complete*\n\n📄 ${file.filename}\n📦 ${formatBytes(file.size)}\n☁️ ${info.provider}`
    }, { quoted: message });

    await fsp.rm(file.tempPath, { force: true }).catch(() => {});
    await sock.sendMessage(jid, { react: { text: "✅", key: message.key } }).catch(() => {});
  } catch (error) {
    console.error(`[CLOUD-DL] ${info?.provider || providerForUrl(input)}:`, error?.message || error);
    await sock.sendMessage(jid, { react: { text: "❌", key: message.key } }).catch(() => {});
    await sock.sendMessage(jid, {
      text: `❌ *Download failed*\n\n${String(error?.message || error)}\n\n💡 Make sure the file is public/downloadable and try again.`
    }, { quoted: message }).catch(() => {});
  }
}

module.exports = [
  { command: "filedl", aliases: ["file", "clouddl", "cloudfile"], category: "download", description: "Download public files from cloud/file hosts", usage: ".filedl <URL>", handler: run },
  { command: "gdrive", aliases: ["drive", "googledrive"], category: "download", description: "Download public Google Drive files", usage: ".gdrive <URL>", handler: run },
  { command: "dropbox", aliases: ["dbox", "dropboxdl"], category: "download", description: "Download public Dropbox files", usage: ".dropbox <URL>", handler: run },
  { command: "gofile", aliases: ["gofileio", "godl"], category: "download", description: "Download public GoFile files", usage: ".gofile <URL>", handler: run },
  { command: "pixeldrain", aliases: ["pixel", "pixeldl"], category: "download", description: "Download public Pixeldrain files", usage: ".pixeldrain <URL>", handler: run },
  { command: "filedlmenu", aliases: ["clouddlm", "filemenu"], category: "download", description: "Show supported public file download hosts", usage: ".filedlmenu", handler: async (sock, message, args, context = {}) => {
      const jid = context.chatId || message.key.remoteJid;
      const prefix = context.prefix || "-";
      return sock.sendMessage(jid, { text: usage(prefix) }, { quoted: message });
    }
  }
];

module.exports._run = run;
