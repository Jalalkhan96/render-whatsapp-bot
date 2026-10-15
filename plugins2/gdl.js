const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const { pipeline } = require('stream/promises');
const { providerForUrl, resolveCloudFile } = require('../lib/cloudFileResolver.cjs');

const MAX_FILE_SIZE = Number(process.env.GDL_MAX_FILE_SIZE_MB || 1024) * 1024 * 1024;
const REQUEST_TIMEOUT_MS = Number(process.env.GDL_TIMEOUT_MS || 15 * 60 * 1000);
const TEMP_DIR = path.join(process.env.TMPDIR || os.tmpdir(), 'abix-gdl');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB']; let value = bytes; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function safeFilename(name) {
  let value = String(name || 'download.bin').split(/[\\/]/).pop().replace(/[\x00-\x1f<>:"|?*]/g, '_').trim();
  if (!value || value === '.' || value === '..') value = 'download.bin';
  if (value.length > 180) { const ext = path.extname(value); value = value.slice(0, 180 - ext.length) + ext; }
  return value;
}

function filenameFromHeaders(headers) {
  const disposition = headers?.['content-disposition'];
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) { try { return safeFilename(decodeURIComponent(utf8[1].trim())); } catch {} }
  const normal = disposition.match(/filename="?([^";]+)"?/i);
  return normal ? safeFilename(normal[1].trim()) : null;
}

function filenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(path.basename(pathname));
    return name && name !== '/' ? safeFilename(name) : null;
  } catch { return null; }
}

function isHtml(headers) {
  return String(headers?.['content-type'] || '').toLowerCase().includes('text/html');
}

function isGitHubUrl(value) {
  try { return new URL(value).hostname.toLowerCase() === 'github.com'; } catch { return false; }
}

async function resolveGitHubUrl(inputUrl) {
  const url = new URL(inputUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 5 && parts[2] === 'releases' && parts[3] === 'download') return inputUrl;
  if (parts.length >= 4 && parts[2] === 'releases') {
    const owner = parts[0], repo = parts[1];
    let apiUrl;
    if (parts[3] === 'latest') {
      apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
    } else if (parts[3] === 'tag' && parts[4]) {
      apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(parts.slice(4).join('/'))}`;
    } else {
      throw new Error('Unsupported GitHub release URL. Use a direct asset URL, /releases/latest, or /releases/tag/<tag>.');
    }
    const response = await axios.get(apiUrl, {
      timeout: 30000, maxContentLength: 2 * 1024 * 1024, maxBodyLength: 2 * 1024 * 1024,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ABIX-GDL/1.0' }
    });
    const assets = Array.isArray(response.data?.assets) ? response.data.assets : [];
    if (!assets.length) throw new Error('No downloadable assets were found in this GitHub release.');
    const requested = url.searchParams.get('asset');
    let asset = requested ? assets.find(a => String(a.name).toLowerCase() === requested.toLowerCase()) : null;
    if (!asset) asset = assets.find(a => a?.browser_download_url && !/^Source code \((zip|tar\.gz)\)$/i.test(String(a.name || '')));
    if (!asset?.browser_download_url) throw new Error('GitHub release does not contain a usable downloadable asset.');
    return asset.browser_download_url;
  }
  throw new Error('Unsupported GitHub URL. Use a release asset URL or a GitHub release page.');
}

async function resolveDownloadUrl(inputUrl) {
  const provider = providerForUrl(inputUrl);
  if (["Google Drive", "Dropbox", "GoFile", "MediaFire", "Pixeldrain"].includes(provider)) {
    const resolved = await resolveCloudFile(inputUrl);
    return resolved.url;
  }
  return isGitHubUrl(inputUrl) ? resolveGitHubUrl(inputUrl) : inputUrl;
}
async function ensureTempDir() { await fsp.mkdir(TEMP_DIR, { recursive: true }); }

async function ensureDiskSpace(requiredBytes) {
  try {
    const stat = await fsp.statfs(TEMP_DIR);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const safetyMargin = 128 * 1024 * 1024;
    if (requiredBytes > freeBytes - safetyMargin) {
      throw new Error(`Not enough disk space. Need about ${formatBytes(requiredBytes)}, but only ${formatBytes(freeBytes)} is available.`);
    }
  } catch (error) {
    if (error?.code === 'ENOSYS' || error?.code === 'ENOTSUP') return;
    throw error;
  }
}

async function downloadToDisk(url) {
  await ensureTempDir();
  const response = await axios.get(url, {
    responseType: 'stream', timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: MAX_FILE_SIZE, maxBodyLength: MAX_FILE_SIZE,
    validateStatus: status => status >= 200 && status < 400,
    headers: { 'User-Agent': 'ABIX-GDL/1.0', Accept: '*/*' }
  });
  if (isHtml(response.headers)) {
    response.data.destroy();
    throw new Error('The URL returned an HTML page instead of a downloadable file.');
  }
  const contentLength = Number(response.headers?.['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    response.data.destroy();
    throw new Error(`File is too large: ${formatBytes(contentLength)}. The current GDL limit is ${formatBytes(MAX_FILE_SIZE)}.`);
  }
  if (Number.isFinite(contentLength) && contentLength > 0) await ensureDiskSpace(contentLength);
  const filename = filenameFromHeaders(response.headers) || filenameFromUrl(response.request?.res?.responseUrl || url) || 'download.bin';
  const tempPath = path.join(TEMP_DIR, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${filename}`);
  let received = 0;
  const countingStream = response.data;
  countingStream.on('data', chunk => {
    received += chunk.length;
    if (received > MAX_FILE_SIZE) countingStream.destroy(new Error(`File exceeded the ${formatBytes(MAX_FILE_SIZE)} GDL limit while downloading.`));
  });
  try {
    await pipeline(countingStream, fs.createWriteStream(tempPath, { flags: 'wx' }));
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  if (received <= 0) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw new Error('Downloaded file is empty.');
  }
  return { tempPath, filename, size: received, contentType: response.headers?.['content-type'] || 'application/octet-stream' };
}

async function sendDocument(sock, jid, tempPath, filename, contentType, quoted) {
  return sock.sendMessage(jid, {
    document: { url: tempPath },
    fileName: filename,
    mimetype: contentType || 'application/octet-stream'
  }, { quoted });
}

// For video mode: stream directly from the remote URL — no disk download needed.
// This avoids filling the server disk with large temp files.
async function sendVideoFromUrl(sock, jid, remoteUrl, filename, quoted) {
  return sock.sendMessage(jid, {
    video: { url: remoteUrl },
    fileName: filename,
    mimetype: 'video/mp4',
    caption: `🎬 *${filename}*\n💠 ABIX GDL`
  }, { quoted });
}

async function gdlCore(sock, msg, args, mode) {
  const from = msg?.key?.remoteJid;
  if (!from) throw new Error('Unable to determine target chat.');
  const inputUrl = String(args?.[0] || '').trim();
  if (!inputUrl) {
    const cmd = mode === 'video' ? 'gdlv' : 'gdl';
    const hint = mode === 'video'
      ? '📹 Sends as *playable video* in WhatsApp (no disk usage)'
      : '📄 Sends as *file/document*';
    return sock.sendMessage(from, {
      text: `❌ Usage:\n-${cmd} <direct-file-url>\n\n${hint}\n\nGitHub:\n-${cmd} <release-asset-url>\n-${cmd} https://github.com/OWNER/REPO/releases/latest`
    }, { quoted: msg });
  }
  if (!/^https?:\/\//i.test(inputUrl)) {
    return sock.sendMessage(from, { text: '❌ Only HTTP/HTTPS URLs are supported.' }, { quoted: msg });
  }

  // VIDEO MODE: stream directly from URL — zero disk usage
  if (mode === 'video') {
    let statusMsgKey = null;
    try {
      const resolvedUrl = await resolveDownloadUrl(inputUrl);
      const filename = filenameFromUrl(resolvedUrl) || filenameFromUrl(inputUrl) || 'video.mp4';
      
      const headRes = await axios.head(resolvedUrl).catch(() => null);
      let sizeStr = '';
      if (headRes && headRes.headers['content-length']) {
        sizeStr = ` (${formatBytes(Number(headRes.headers['content-length'] || 0))})`;
      }
      
      const statusMsg = await sock.sendMessage(from, { text: `⏳ *Processing video${sizeStr}...*` }, { quoted: msg });
      statusMsgKey = statusMsg?.key;

      console.log(`[GDL] Streaming video from URL to WhatsApp: ${filename}`);
      await sendVideoFromUrl(sock, from, resolvedUrl, filename, msg);
      console.log(`[GDL] Sent ${filename} as video (streamed, no disk)`);
      
      // Cleanup status message
      if (statusMsgKey) await sock.sendMessage(from, { delete: statusMsgKey }).catch(() => {});
      return true;
    } catch (error) {
      console.error('[GDL] Error:', error);
      if (statusMsgKey) await sock.sendMessage(from, { delete: statusMsgKey }).catch(() => {});
      await sock.sendMessage(from, {
        text: `❌ GDLv failed\n\n${String(error?.message || error)}`
      }, { quoted: msg }).catch(() => {});
      return false;
    }
  }

  // DOCUMENT MODE: download to disk, send as file, then delete
  let tempPath = null;
  let statusMsgKey = null;
  try {
    const resolvedUrl = await resolveDownloadUrl(inputUrl);
    
    // Get size for status
    const headRes = await axios.head(resolvedUrl).catch(() => null);
    let sizeStr = '';
    if (headRes && headRes.headers['content-length']) {
      sizeStr = ` (${formatBytes(Number(headRes.headers['content-length'] || 0))})`;
    }
    
    const statusMsg = await sock.sendMessage(from, { text: `⏳ *Downloading file${sizeStr}...* Please wait.` }, { quoted: msg });
    statusMsgKey = statusMsg?.key;

    const info = await downloadToDisk(resolvedUrl);
    tempPath = info.tempPath;
    console.log(`[GDL] Downloaded ${info.filename} (${formatBytes(info.size)}) to disk`);
    
    // Update status to "Sending"
    if (statusMsgKey) {
      await sock.sendMessage(from, { text: `📤 *Sending file...*` }, { edit: statusMsgKey }).catch(() => {});
    }

    await sendDocument(sock, from, info.tempPath, info.filename, info.contentType, msg);
    console.log(`[GDL] Sent ${info.filename} (${formatBytes(info.size)}) as document`);
    
    // Cleanup status
    if (statusMsgKey) await sock.sendMessage(from, { delete: statusMsgKey }).catch(() => {});
    return true;
  } catch (error) {
    console.error('[GDL] Error:', error);
    await sock.sendMessage(from, {
      text: `❌ GDL failed\n\n${String(error?.message || error)}\n\nMaximum configured size: ${formatBytes(MAX_FILE_SIZE)}`
    }, { quoted: msg }).catch(() => {});
    return false;
  } finally {
    if (tempPath) await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

module.exports = [
  {
    command: 'gdl',
    aliases: ['gdl'],
    description: 'Download a direct URL and send as a file/document (up to 1 GB).',
    async handler(sock, msg, args) {
      return gdlCore(sock, msg, args, 'document');
    }
  },
  {
    command: 'gdlv',
    aliases: ['gdlv', 'gdlvideo'],
    description: 'Download a direct video URL and send as a playable WhatsApp video (up to 1 GB).',
    async handler(sock, msg, args) {
      return gdlCore(sock, msg, args, 'video');
    }
  }
];
