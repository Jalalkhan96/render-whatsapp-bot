'use strict';

/**
 * download.cjs — SSRF-protected image downloader.
 *
 * Guards:
 *  - http/https only
 *  - hostname resolved via DNS; private / loopback / link-local /
 *    multicast / reserved ranges are REJECTED (no downloading from LAN)
 *  - 25 MB per-file cap (config.maxDownloadBytes)
 *  - content-type must look like an image
 *  - writes `<file>.license.json` sidecar with license + attribution
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const config = require('./config.cjs');

function isPrivateIp(ip) {
  // IPv4
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true; // multicast + reserved
    if (a === 0) return true;
    return false;
  }
  // IPv6: loopback, link-local, unique-local, multicast, unspecified
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('fe80:') || v6.startsWith('fec0:')) return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;
  if (v6.startsWith('ff')) return true;
  return false;
}

async function assertPublicHost(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`refused protocol ${u.protocol}`);
  }
  const addrs = await dns.lookup(u.hostname, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`refused: ${u.hostname} resolves to private IP ${a.address}`);
    }
  }
  return u;
}

function safeName(item, idx) {
  const ext = (path.extname(new URL(item.imageUrl).pathname) || '.jpg').toLowerCase();
  const base = `${item.source}-${String(idx + 1).padStart(3, '0')}-${item.id.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
  return base + (config.imageExts.includes(ext) ? ext : '.jpg');
}

async function downloadOne(item, destDir, idx, timeoutMs) {
  const u = await assertPublicHost(item.imageUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.defaultTimeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.userAgent, Accept: '*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('image/')) throw new Error(`not an image (content-type: ${ct || 'missing'})`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > config.maxDownloadBytes) throw new Error(`too large (${len} bytes)`);

    const fileName = safeName(item, idx);
    const filePath = path.join(destDir, fileName);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > config.maxDownloadBytes) throw new Error('too large (streamed)');
    fs.writeFileSync(filePath, buf);

    const sidecar = {
      file: fileName,
      bytes: buf.length,
      source: item.source,
      title: item.title,
      imageUrl: item.imageUrl,
      pageUrl: item.pageUrl,
      author: item.author,
      license: item.license.status === 'free'
        ? { status: 'free', name: item.license.name, url: item.license.url, attribution: item.license.attribution }
        : { status: 'unknown', note: 'User-generated meme content — personal use only; check the source page terms. NOT marked free.' },
      downloadedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath + '.license.json', JSON.stringify(sidecar, null, 2));
    return { ok: true, file: filePath, bytes: buf.length };
  } finally {
    clearTimeout(timer);
  }
}

async function downloadAll(items, destDir, { timeoutMs } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const results = [];
  let i = 0;
  for (const item of items) {
    try {
      results.push({ item, ...(await downloadOne(item, destDir, i, timeoutMs)) });
    } catch (err) {
      results.push({ item, ok: false, error: err.message });
    }
    i++;
  }
  return results;
}

module.exports = { downloadAll, downloadOne, isPrivateIp, assertPublicHost };
