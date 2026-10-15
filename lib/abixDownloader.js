const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://ahm7xmakki.com/api/alldl';
const MAX_MEDIA = 55 * 1024 * 1024;
const SUPPORTED = new Set([
  'youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'x', 'reddit',
  'snapchat', 'soundcloud', 'capcut', 'snackvideo', 'douyin'
]);

function platformFor(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (h === 'youtu.be' || h.includes('youtube.')) return 'YouTube';
    if (h.includes('tiktok')) return 'TikTok';
    if (h.includes('instagram')) return 'Instagram';
    if (h.includes('facebook') || h === 'fb.watch') return 'Facebook';
    if (h.includes('twitter') || h.includes('x.com')) return 'Twitter/X';
    if (h.includes('reddit') || h === 'redd.it') return 'Reddit';
    if (h.includes('snapchat')) return 'Snapchat';
    if (h.includes('soundcloud')) return 'SoundCloud';
    if (h.includes('capcut')) return 'CapCut';
    if (h.includes('snackvideo')) return 'SnackVideo';
    if (h.includes('douyin')) return 'Douyin';
  } catch {}
  return 'Unknown';
}

function cleanUrl(value) {
  const match = String(value || '').match(/https?:\/\/[^\s<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : null;
}

async function allDl(url, options = {}) {
  const videoUrl = cleanUrl(url);
  if (!videoUrl) throw new Error('Valid media URL required.');
  const response = await axios.get(BASE, {
    params: { url: videoUrl },
    timeout: options.timeout || 120000,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ABIX downloader HTTP ${response.status}`);
  }
  const data = response.data;
  if (!data?.success || !data.mediaInfo) {
    throw new Error(data?.message || 'ABIX downloader did not return media.');
  }
  const info = data.mediaInfo;
  return {
    ...info,
    sourceUrl: videoUrl,
    platform: info.platform || platformFor(videoUrl),
    videoUrl: info.videoUrl || info.downloadUrl || info.url || info.video || null,
    audioUrl: info.audioUrl || info.audio || info.mp3 || null,
    thumbnail: info.thumbnail || info.coverImage || null,
    qualities: Array.isArray(info.qualities) ? info.qualities : [],
  };
}

async function fetchMedia(url, maxBytes = MAX_MEDIA) {
  if (!url) throw new Error('Media URL is missing.');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 300000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
    validateStatus: status => status >= 200 && status < 300,
  });
  const type = String(response.headers['content-type'] || '').toLowerCase();
  const buffer = Buffer.from(response.data);
  if (!buffer.length) throw new Error('Downloaded media is empty.');
  if (type.includes('text/html') || type.includes('application/json')) {
    throw new Error('Media endpoint returned a webpage/JSON instead of media.');
  }
  if (buffer.length > maxBytes) throw new Error(`Media exceeds ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  return { buffer, contentType: type || 'application/octet-stream' };
}

function chooseVideo(info) {
  if (info?.videoUrl) return info.videoUrl;
  return info?.qualities?.find(q => q?.url)?.url || null;
}

function chooseAudio(info) {
  return info?.audioUrl || null;
}

function safeFileName(value, fallback = 'media') {
  const clean = String(value || fallback).replace(/[^a-z0-9._-]+/gi, '_').replace(/^\.+/, '').slice(0, 80);
  return clean || fallback;
}

async function saveMedia(url, outDir, info, kind = 'video') {
  const chosen = kind === 'audio' ? chooseAudio(info) : chooseVideo(info);
  if (!chosen) throw new Error(`${kind} download URL not available.`);
  const { buffer, contentType } = await fetchMedia(chosen);
  fs.mkdirSync(outDir, { recursive: true });
  const ext = kind === 'audio' ? (contentType.includes('mpeg') ? 'mp3' : 'm4a') : 'mp4';
  const filePath = path.join(outDir, `${Date.now()}_${safeFileName(info?.title, kind)}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, buffer, contentType, url: chosen };
}

module.exports = { BASE, SUPPORTED, cleanUrl, platformFor, allDl, fetchMedia, chooseVideo, chooseAudio, saveMedia, safeFileName };
