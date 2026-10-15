'use strict';
/**
 * Download-on-demand: license gate -> SSRF-checked fetch -> size cap ->
 * magic-bytes MIME validation -> SVG sanitize -> temp file.
 * Never bulk-downloads. Caller must cleanupTemp(path) after sending.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('./http');
const { decideDownload } = require('./license');
const { sanitizeSvg } = require('./svg-sanitize');

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg',
};
const ALLOWED = new Set(Object.keys(EXT));

function detectMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp' &&
      /avif/i.test(buf.toString('ascii', 8, 12))) return 'image/avif';
  const head = buf.slice(0, 512).toString('utf8').trimStart();
  if ((head.startsWith('<?xml') && head.includes('<svg')) || head.startsWith('<svg')) return 'image/svg+xml';
  return null;
}

function isExecutable(buf) {
  if (!buf || buf.length < 2) return true;
  if (buf[0] === 0x4D && buf[1] === 0x5A) return true; // MZ executable
  if (buf[0] === 0x7F && buf[1] === 0x45) return true; // ELF
  if (buf[0] === 0x50 && buf[1] === 0x4B) return true; // ZIP/PK
  const head = buf.slice(0, 64).toString('utf8');
  if (/^#!/m.test(head) || head.includes('<?php') || head.startsWith('%PDF')) return true;
  return false;
}

async function downloadImage(image, options = {}) {
  const decision = decideDownload(image);
  if (decision.allow === 'deny') throw new Error(`Download denied: ${decision.reason}`);

  const maxMB = options.maxMB || envInt('IMAGE_MAX_DOWNLOAD_MB', 10);
  const maxPixels = envInt('MAX_IMAGE_PIXELS', 40000000);
  const url = image.downloadUrl || image.imageUrl;
  if (!url) throw new Error('No image URL to download');
  if (image.width && image.height && image.width * image.height > maxPixels) {
    throw new Error(`Image exceeds MAX_IMAGE_PIXELS (${maxPixels})`);
  }

  const r = await http.get(url, { maxBytes: maxMB * 1024 * 1024 + 4096 });
  const buf = r.body;
  if (buf.length > maxMB * 1024 * 1024) throw new Error(`File exceeds ${maxMB}MB limit`);
  if (isExecutable(buf)) throw new Error('Rejected: executable/archive content detected');

  const magic = detectMime(buf);
  if (!magic || !ALLOWED.has(magic)) throw new Error('Rejected: not a recognized image format');
  const declared = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (declared && declared.startsWith('image/') && declared !== magic) {
    throw new Error(`MIME mismatch: declared ${declared}, detected ${magic}`);
  }

  let out = buf;
  if (magic === 'image/svg+xml') out = Buffer.from(sanitizeSvg(buf.toString('utf8')), 'utf8');

  const file = path.join(os.tmpdir(), `imgeng-${crypto.randomBytes(8).toString('hex')}${EXT[magic]}`);
  fs.writeFileSync(file, out);
  return {
    path: file,
    bytes: out.length,
    mime: magic,
    width: image.width || 0,
    height: image.height || 0,
    licenseWarning: decision.allow === 'warn' ? decision.reason : null,
  };
}

function cleanupTemp(p) {
  try { if (p) fs.unlinkSync(p); } catch (_) { /* ignore */ }
}

module.exports = { downloadImage, cleanupTemp, detectMime, ALLOWED: [...ALLOWED] };
