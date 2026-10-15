'use strict';

/**
 * download.cjs — SSRF-protected audio downloader.
 * Only called for items with downloadable === true (wikimedia-audio).
 * Guards: http/https only, DNS-resolved host must not be private,
 * 25 MB cap, audio-ish content-type, .license.json sidecar per file.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const config = require('./config.cjs');

function isPrivateIp(ip) {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true;
    return false;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fe80:') ||
    v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('ff');
}

async function assertPublicHost(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`refused protocol ${u.protocol}`);
  }
  const addrs = await dns.lookup(u.hostname, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error(`refused: private IP ${a.address}`);
  }
  return u;
}

function safeName(item, idx) {
  let ext = '.ogg';
  try {
    const pext = path.extname(new URL(item.mediaUrl).pathname).toLowerCase();
    if (config.audioExts.includes(pext)) ext = pext;
  } catch { /* keep default */ }
  const base = `${item.source}-${String(idx + 1).padStart(3, '0')}-${item.id.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
  return base + ext;
}

async function downloadOne(item, destDir, idx, timeoutMs) {
  if (!item.downloadable || !item.mediaUrl) {
    throw new Error('not downloadable (links-only source)');
  }
  const u = await assertPublicHost(item.mediaUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.defaultTimeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.userAgent, Accept: '*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const len = Number(res.headers.get('content-length') || 0);
    if (len > config.maxDownloadBytes) throw new Error(`too large (${len} bytes)`);
    const fileName = safeName(item, idx);
    const filePath = path.join(destDir, fileName);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > config.maxDownloadBytes) throw new Error('too large (streamed)');
    if (!ct.includes('audio') && !ct.includes('ogg') && !ct.includes('octet-stream')) {
      throw new Error(`not audio (content-type: ${ct || 'missing'})`);
    }
    fs.writeFileSync(filePath, buf);
    const sidecar = {
      file: fileName,
      bytes: buf.length,
      source: item.source,
      title: item.title,
      mediaUrl: item.mediaUrl,
      pageUrl: item.pageUrl,
      author: item.author,
      license: item.license.status === 'free'
        ? { status: 'free', name: item.license.name, url: item.license.url, attribution: item.license.attribution }
        : { status: 'unknown', note: 'License not verified — check the source page. NOT marked free.' },
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
  for (const item of items.filter((x) => x.downloadable)) {
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
