'use strict';

const DEFAULT_URL = 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_SEND_BYTES = Math.max(1, Number(process.env.VD_MAX_SEND_MB || 64)) * 1024 * 1024;
const POLL_MS = Math.max(1000, Number(process.env.VD_POLL_MS || 2500));
const MAX_POLL_MS = Math.max(60_000, Number(process.env.VD_MAX_WAIT_MS || 20 * 60 * 1000));

function baseUrl() {
  return String(process.env.VIDEO_DOWNLOADER_URL || DEFAULT_URL).trim().replace(/\/$/, '');
}

function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const key = String(process.env.VIDEO_DOWNLOADER_API_KEY || '').trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

function prefix(context = {}) {
  return context.prefix || '-';
}

function urlFor(path) {
  return `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function jsonRequest(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(urlFor(path), {
    ...options,
    headers: apiHeaders(options.headers || {}),
  }, timeoutMs);

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) {}

  if (!response.ok) {
    const message = payload?.detail || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(String(message).slice(0, 500));
  }
  return payload;
}

function usage(context, lines) {
  return lines.map(String).join('\n').replaceAll('{p}', prefix(context));
}

async function sendText(sock, message, text) {
  return sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

function normalizePreset(value) {
  const v = String(value || '').trim().toLowerCase();
  const map = {
    '1080': '1080p', '1080p': '1080p',
    '720': '720p', '720p': '720p',
    '480': '480p', '480p': '480p',
    'mp3': 'audio_mp3', 'audio': 'audio_mp3',
    'm4a': 'audio_m4a',
    'best': 'best_mp4', 'best_mp4': 'best_mp4',
  };
  return map[v] || null;
}

function safeFilename(name, fallback = 'video') {
  return String(name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || fallback;
}

async function analyzeHandler(sock, message, args = [], context = {}) {
  const input = args.join(' ').trim();
  if (!input) return sendText(sock, message, usage(context, [
    'Usage: {p}vdanalyze <URL>',
    '',
    'Analyze a public media URL without downloading it.'
  ]));

  try {
    const data = await jsonRequest('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input }),
    }, 90_000);

    const formats = Array.isArray(data.formats) ? data.formats.slice(0, 10) : [];
    const presets = Array.isArray(data.presets) ? data.presets.map(x => x.id).filter(Boolean) : [];
    const lines = [
      '🎬 *VIDEO DOWNLOADER — ANALYZE*',
      '',
      `📌 Platform: *${data.platform || 'generic'}*`,
      `📝 Title: *${data.title || 'Unknown'}*`,
      `👤 Uploader: *${data.uploader || 'Unknown'}*`,
      data.duration ? `⏱️ Duration: *${data.duration}s*` : null,
      `🔧 Stage: *${data.stage_used || 'unknown'}*`,
      '',
      `🎚️ Presets: ${presets.length ? presets.join(', ') : 'none'}`,
      `📦 Formats shown: *${formats.length}*`,
    ].filter(Boolean);

    for (const f of formats.slice(0, 6)) {
      const size = f.filesize ? ` • ${(f.filesize / 1024 / 1024).toFixed(1)} MB` : '';
      const res = f.resolution || f.ext || 'format';
      lines.push(`• ${f.format_id} — ${res}${f.has_audio ? ' + audio' : ''}${size}`);
    }
    return sendText(sock, message, lines.join('\n'));
  } catch (error) {
    return sendText(sock, message, `❌ *ANALYZE FAILED*\n\n${error.message}`);
  }
}

async function waitForJob(jobId) {
  const started = Date.now();
  while (Date.now() - started < MAX_POLL_MS) {
    const job = await jsonRequest(`/api/jobs/${encodeURIComponent(jobId)}`, {}, 15_000);
    if (['done', 'failed'].includes(job?.status)) return job;
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Download job ${jobId} did not finish within the configured wait window.`);
}

async function downloadHandler(sock, message, args = [], context = {}) {
  const inputArgs = [...args].map(String).filter(Boolean);
  let preset = null;
  if (inputArgs[0]) {
    preset = normalizePreset(inputArgs[0]);
    if (preset) inputArgs.shift();
  }
  const input = inputArgs.join(' ').trim();
  if (!input) return sendText(sock, message, usage(context, [
    'Usage: {p}vddownload [480p|720p|1080p|mp3|m4a|best] <URL>',
    '',
    'Downloads through the configured Universal Video Downloader service.',
    'Large files are returned as a link instead of buffering them into bot RAM.'
  ]));

  try {
    const accepted = await jsonRequest('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input, preset }),
    }, 30_000);
    const jobId = accepted?.job_id;
    if (!jobId) throw new Error('Downloader did not return a job id.');

    await sendText(sock, message, `⏳ *DOWNLOAD QUEUED*\n\nJob: *${jobId}*\nPreset: *${preset || 'best'}*\n\nUse {p}vdstatus ${jobId} to check it.`.replaceAll('{p}', prefix(context)));

    const job = await waitForJob(jobId);
    if (job.status !== 'done') {
      throw new Error(job.error || `Job finished with status: ${job.status}`);
    }

    const fileUrl = urlFor(`/api/files/${encodeURIComponent(jobId)}`);
    const response = await fetchWithTimeout(fileUrl, { headers: apiHeaders() }, 60_000);
    if (!response.ok) throw new Error(`File fetch failed: HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    const filename = safeFilename(job.filename || job.title || 'video');
    const isAudio = /\.(mp3|m4a|aac|wav|ogg)$/i.test(filename);

    if (contentLength && contentLength > MAX_SEND_BYTES) {
      return sendText(sock, message,
        `✅ *DOWNLOAD READY*\n\n📁 ${filename}\n📦 ${(contentLength / 1024 / 1024).toFixed(1)} MB\n\n🔗 ${fileUrl}\n\nFile is larger than the bot RAM-send limit (${Math.round(MAX_SEND_BYTES / 1024 / 1024)} MB), so I returned the direct service link instead.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SEND_BYTES) {
      return sendText(sock, message,
        `✅ *DOWNLOAD READY*\n\n📁 ${filename}\n📦 ${(buffer.length / 1024 / 1024).toFixed(1)} MB\n\n🔗 ${fileUrl}\n\nFile exceeded the configured RAM-send limit (${Math.round(MAX_SEND_BYTES / 1024 / 1024)} MB).`);
    }

    const content = isAudio
      ? { audio: buffer, mimetype: 'audio/mpeg', fileName: filename.endsWith('.mp3') ? filename : `${filename}.mp3` }
      : { video: buffer, mimetype: 'video/mp4', fileName: filename.endsWith('.mp4') ? filename : `${filename}.mp4`, caption: `🎬 *${filename}*` };
    return sock.sendMessage(message.key.remoteJid, content, { quoted: message });
  } catch (error) {
    return sendText(sock, message, `❌ *VIDEO DOWNLOAD FAILED*\n\n${error.message}`);
  }
}

async function statusHandler(sock, message, args = [], context = {}) {
  const jobId = String(args[0] || '').trim();
  if (!jobId) return sendText(sock, message, usage(context, ['Usage: {p}vdstatus <job_id>']));
  try {
    const job = await jsonRequest(`/api/jobs/${encodeURIComponent(jobId)}`, {}, 15_000);
    return sendText(sock, message, [
      '📊 *VIDEO DOWNLOAD STATUS*',
      '',
      `🆔 Job: *${job.job_id}*`,
      `📌 Status: *${job.status}*`,
      `📈 Progress: *${Number(job.progress || 0).toFixed(1)}%*`,
      job.speed ? `⚡ Speed: *${job.speed}*` : null,
      job.eta ? `⏳ ETA: *${job.eta}*` : null,
      job.stage_used ? `🔁 Stage: *${job.stage_used}*` : null,
      job.filename ? `📁 File: *${job.filename}*` : null,
      job.error ? `❌ Error: ${job.error}` : null,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    return sendText(sock, message, `❌ *STATUS FAILED*\n\n${error.message}`);
  }
}

async function cancelHandler(sock, message, args = [], context = {}) {
  const jobId = String(args[0] || '').trim();
  if (!jobId) return sendText(sock, message, usage(context, ['Usage: {p}vdcancel <job_id>']));
  try {
    await jsonRequest(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }, 20_000);
    return sendText(sock, message, `✅ Cancelled/deleted video job *${jobId}* and its stored file.`);
  } catch (error) {
    return sendText(sock, message, `❌ *CANCEL FAILED*\n\n${error.message}`);
  }
}

async function healthHandler(sock, message) {
  try {
    const health = await jsonRequest('/health', {}, 10_000);
    return sendText(sock, message, [
      '🩺 *VIDEO DOWNLOADER HEALTH*',
      '',
      `Status: *${health.status || 'unknown'}*`,
      `yt-dlp: *${health.ytdlp_version || 'unknown'}*`,
      `FFmpeg: *${health.ffmpeg ? 'OK' : 'NO'}*`,
      `FFprobe: *${health.ffprobe ? 'OK' : 'NO'}*`,
      `Deno: *${health.deno ? 'OK' : 'NO'}*`,
      `Redis: *${health.redis ? 'OK' : 'NO'}*`,
      `Endpoint: *${baseUrl()}*`,
    ].join('\n'));
  } catch (error) {
    return sendText(sock, message, `❌ *VIDEO DOWNLOADER OFFLINE*\n\nEndpoint: ${baseUrl()}\nError: ${error.message}`);
  }
}

async function infoHandler(sock, message) {
  try {
    const info = await jsonRequest('/api/info', {}, 10_000);
    return sendText(sock, message, [
      'ℹ️ *VIDEO DOWNLOADER SERVICE*',
      '',
      `Name: *${info.name || 'Universal Video Downloader'}*`,
      `Version: *${info.version || 'unknown'}*`,
      `Public URL: *${info.public_base_url || baseUrl()}*`,
      `API key required: *${info.auth_required ? 'YES' : 'NO'}*`,
    ].join('\n'));
  } catch (error) {
    return sendText(sock, message, `❌ *SERVICE INFO FAILED*\n\n${error.message}`);
  }
}

function menuHandler(sock, message, args, context = {}) {
  const p = prefix(context);
  const text = [
    '🎬 *ABIX VIDEO DOWNLOADER SUITE*',
    '',
    `Endpoint: *${baseUrl()}*`,
    '',
    '*ANALYZE / DOWNLOAD*',
    `${p}vdanalyze <URL>`,
    `${p}vddownload [480p|720p|1080p|mp3|m4a|best] <URL>`,
    '',
    '*JOB CONTROL*',
    `${p}vdstatus <job_id>`,
    `${p}vdcancel <job_id>`,
    '',
    '*SERVICE*',
    `${p}vdhealth`,
    `${p}vdinfo`,
    '',
    '✅ Existing -downloadvideo remains unchanged.',
    '🛡️ Heavy download commands are owner-only to avoid uncontrolled RAM/disk usage.',
    '📁 Full Python extractor service: plugins2/video-downloader-suite/',
  ].join('\n');
  return sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

module.exports = [
  {
    command: 'vdmenu',
    aliases: ['videodlmenu', 'videosuite', 'vdownmenu'],
    category: 'video-downloader',
    description: 'Separate menu for the Universal Video Downloader Suite',
    ownerOnly: true,
    dedicatedMenu: false,
    handler: menuHandler,
  },
  {
    command: 'vdanalyze',
    aliases: ['vda', 'videoanalyze'],
    category: 'video-downloader',
    description: 'Analyze a media URL with the Universal Video Downloader service',
    ownerOnly: true,
    handler: analyzeHandler,
  },
  {
    command: 'vddownload',
    aliases: ['vd', 'videodownload', 'vdl'],
    category: 'video-downloader',
    description: 'Download a media URL through the Universal Video Downloader service',
    ownerOnly: true,
    handler: downloadHandler,
  },
  {
    command: 'vdstatus',
    aliases: ['vdjob', 'videostatus'],
    category: 'video-downloader',
    description: 'Check a Universal Video Downloader job',
    ownerOnly: true,
    handler: statusHandler,
  },
  {
    command: 'vdcancel',
    aliases: ['vdstop', 'videocancel'],
    category: 'video-downloader',
    description: 'Cancel and delete a Universal Video Downloader job',
    ownerOnly: true,
    handler: cancelHandler,
  },
  {
    command: 'vdhealth',
    aliases: ['vdping'],
    category: 'video-downloader',
    description: 'Check Universal Video Downloader service health',
    ownerOnly: true,
    handler: healthHandler,
  },
  {
    command: 'vdinfo',
    aliases: ['vdservice', 'vdurl'],
    category: 'video-downloader',
    description: 'Show Universal Video Downloader service information',
    ownerOnly: true,
    handler: infoHandler,
  },
];
