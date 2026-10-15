import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('downloaders');
const TEMP_DIR = path.join(os.tmpdir(), 'abix-whatsapp');
const ABIX_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: process.env.NEWSLETTER_JID || '120363413637544342@newsletter',
    newsletterName: process.env.NEWSLETTER_NAME || 'ABIX-AE',
    serverMessageId: -1,
  },
};

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function platformFromUrl(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('youtube-nocookie.com')) return 'youtube';
  if (host.includes('tiktok.com')) return 'tiktok';
  return 'other';
}

async function apiDownloadInfo(url) {
  const endpoint = `${config.downloads.apiUrl}?action=download&url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Downloader API HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success) throw new Error(data?.message || 'Downloader API failed');
  return data.data || data;
}

async function youtubeApiInfo(url) {
  if (!config.downloads.youtubeApiUrl) return null;
  const sep = config.downloads.youtubeApiUrl.includes('?') ? '&' : '?';
  const endpoint = `${config.downloads.youtubeApiUrl}${sep}url=${encodeURIComponent(url)}`;
  const headers = config.downloads.youtubeApiKey
    ? { Authorization: `Bearer ${config.downloads.youtubeApiKey}` }
    : {};
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
  const data = await res.json();
  if (data?.success === false) throw new Error(data.message || 'YouTube API failed');
  return data.data || data;
}

function numericQuality(q) {
  const m = String(q || '').match(/(\d{3,4})p/i);
  return m ? Number(m[1]) : 0;
}

function parseSize(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim().toUpperCase();
  const m = s.match(/([\d.]+)\s*(KB|MB|GB|B)/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'GB' ? n * 1024 ** 3 : m[2] === 'MB' ? n * 1024 ** 2 : m[2] === 'KB' ? n * 1024 : n;
}

function chooseNormalVideo(videos) {
  const candidates = videos
    .filter((v) => v?.url)
    .map((v) => ({ ...v, qualityNum: numericQuality(v.quality), sizeBytes: parseSize(v.size) }))
    .filter((v) => !v.sizeBytes || v.sizeBytes <= config.downloads.maxBytes);

  if (!candidates.length) return null;

  const under720 = candidates.filter((v) => !v.qualityNum || v.qualityNum <= 720);
  under720.sort((a, b) => Math.abs((a.qualityNum || 480) - 720) - Math.abs((b.qualityNum || 480) - 720));
  return under720[0] || candidates[0];
}

async function readUrlToBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Media HTTP ${res.status}`);
  const length = Number(res.headers.get('content-length') || 0);
  if (length > config.downloads.maxBytes) {
    throw new Error(`File is larger than ${Math.round(config.downloads.maxBytes / 1024 / 1024)} MB`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > config.downloads.maxBytes) {
    throw new Error(`File is larger than ${Math.round(config.downloads.maxBytes / 1024 / 1024)} MB`);
  }
  return buffer;
}

async function sendVideo(sock, jid, msg, item, title, platform) {
  const buffer = await readUrlToBuffer(item.url);
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  await sock.sendMessage(jid, {
    video: buffer,
    caption: `📹 *${platform.toUpperCase()} DOWNLOAD*\n\n🎬 ${title || 'Video'}\n🎞️ Quality: ${item.quality || 'Normal'}\n📦 Size: ${sizeMB} MB\n\nABIX • normal quality`,
    contextInfo: ABIX_FORWARD,
  }, { quoted: msg });
}

async function sendDocument(sock, jid, msg, url, fileName = 'download') {
  const buffer = await readUrlToBuffer(url);
  await sock.sendMessage(jid, {
    document: buffer,
    fileName,
    mimetype: 'application/octet-stream',
  }, { quoted: msg });
}

export async function handleYouTube({ sock, jid, msg, arg }) {
  if (!arg) return '⚠️ Usage: $yt <YouTube URL>';
  if (!isHttpUrl(arg)) return '❌ Invalid URL.';
  if (platformFromUrl(arg) !== 'youtube') return '❌ Please provide a YouTube URL.';

  try {
    const result = await youtubeApiInfo(arg) || await apiDownloadInfo(arg);
    const videos = result.videos || [];
    const chosen = chooseNormalVideo(videos);
    if (!chosen) return '❌ No downloadable video under 100 MB was found.';

    await sendVideo(sock, jid, msg, chosen, result.title, 'youtube');
    return null;
  } catch (err) {
    log.warn({ err: err.message }, 'YouTube download failed');
    return `❌ YouTube download failed: ${err.message}`;
  }
}

export async function handleTikTok({ sock, jid, msg, arg }) {
  if (!arg) return '⚠️ Usage: $tt <TikTok URL>';
  if (!isHttpUrl(arg)) return '❌ Invalid URL.';
  if (platformFromUrl(arg) !== 'tiktok') return '❌ Please provide a TikTok URL.';

  try {
    const result = await apiDownloadInfo(arg);
    const title = result.title || 'TikTok';

    const photos = result.photos || [];
    if (photos.length > 0) {
      let sent = 0;
      for (const p of photos) {
        if (!p?.url) continue;
        const buffer = await readUrlToBuffer(p.url);
        await sock.sendMessage(jid, {
          image: buffer,
          caption: sent === 0 ? `🖼️ *TIKTOK SLIDES*\n\n${title}\n📸 ${photos.length} slide(s)` : undefined,
        }, { quoted: msg });
        sent += 1;
      }
      return sent ? null : '❌ No TikTok slides could be downloaded.';
    }

    const chosen = chooseNormalVideo(result.videos || []);
    if (!chosen) return '❌ No TikTok video under 100 MB was found.';

    await sendVideo(sock, jid, msg, chosen, title, 'tiktok');
    return null;
  } catch (err) {
    log.warn({ err: err.message }, 'TikTok download failed');
    return `❌ TikTok download failed: ${err.message}`;
  }
}

export async function handleUniversalDownload({ sock, jid, msg, arg }) {
  if (!arg) return '⚠️ Usage: $dl <URL>';
  if (!isHttpUrl(arg)) return '❌ Invalid URL.';

  try {
    const result = await apiDownloadInfo(arg);
    const videos = result.videos || [];
    const chosen = chooseNormalVideo(videos);
    if (chosen) {
      await sendVideo(sock, jid, msg, chosen, result.title, result.source || 'media');
      return null;
    }

    const audio = result.audios?.find((a) => a?.url);
    if (audio) {
      const buffer = await readUrlToBuffer(audio.url);
      await sock.sendMessage(jid, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: 'abix-audio.mp3',
      }, { quoted: msg });
      return null;
    }

    const photo = result.photos?.find((p) => p?.url);
    if (photo) {
      const buffer = await readUrlToBuffer(photo.url);
      await sock.sendMessage(jid, { image: buffer }, { quoted: msg });
      return null;
    }

    return '❌ No downloadable media found.';
  } catch (err) {
    return `❌ Download failed: ${err.message}`;
  }
}

export async function handleDocumentDownload({ sock, jid, msg, arg }) {
  if (!arg) return '⚠️ Usage: $doc <direct file URL>';
  if (!isHttpUrl(arg)) return '❌ Invalid URL.';

  try {
    const u = new URL(arg);
    const fileName = path.basename(u.pathname) || `abix-${crypto.randomUUID()}.bin`;
    await sendDocument(sock, jid, msg, arg, fileName.slice(0, 120));
    return null;
  } catch (err) {
    return `❌ Document download failed: ${err.message}`;
  }
}
