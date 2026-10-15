'use strict';

/**
 * ABIX Pinterest downloader — public web page only, NO API KEYS
 * Replace the current plugins2/pindl.js with this file.
 *
 * Existing command/aliases preserved:
 *   -pindl
 *   -pinterestdl
 *   -pindownload
 *   -pinterestvideo
 *   -pinvideo
 *   -pinterestdownloader
 *
 * Added:
 *   -pintest <Pinterest URL>
 *
 * Also supports:
 *   -pindl image <URL>
 *   -pindl video <URL>
 *   -pindl info <URL>
 *
 * No Pinterest API, login, cookies, CAPTCHA bypass, or private endpoint is used.
 * Optional yt-dlp fallback is a local program, not an API.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TMP = path.join(os.tmpdir(), 'abix-pindl');
const MAX_BYTES = intEnv('PINDL_MAX_BYTES', 1 * 1024 * 1024, 80 * 1024 * 1024, 40 * 1024 * 1024);
const TIMEOUT_MS = intEnv('PINDL_TIMEOUT_MS', 5000, 60000, 20000);
const YTDLP_TIMEOUT_MS = intEnv('PINDL_YTDLP_TIMEOUT_MS', 10000, 120000, 60000);
const COOLDOWN_MS = intEnv('PINDL_COOLDOWN_MS', 1000, 60000, 6000);
const UA = process.env.PINDL_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36 ABIX-PinDL/2.0';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
};

const busy = new Set();
const last = new Map();

function intEnv(name, min, max, fallback) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isHttp(url) { try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function decodeHtml(s) { return String(s || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>'); }
function decodeJsonEscapes(s) { return decodeHtml(String(s || '').replace(/\\\//g, '/').replace(/\\u0026/gi, '&').replace(/\\u003d/gi, '=').replace(/\\u003f/gi, '?')); }
function abs(raw, base) { try { const u = new URL(decodeJsonEscapes(raw), base); return isHttp(u.href) ? u.href : null; } catch { return null; } }
function unique(xs) { const s = new Set(); return (xs || []).filter(x => x && !s.has(x) && s.add(x)); }
function mediaUrl(url) { return /(?:i\.pinimg\.com|pinimg\.com|pinterest\.com|pin\.it|\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)|\.gif(?:[?#]|$)|\.jpg(?:[?#]|$)|\.jpeg(?:[?#]|$)|\.png(?:[?#]|$)|\.webp(?:[?#]|$))/i.test(url || ''); }

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { redirect: 'follow', headers: HEADERS, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), url: r.url };
  } finally { clearTimeout(timer); }
}

function metaValue(html, name) {
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${e}["'][^>]+content=["']([^"']+)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${e}["']`, 'i');
  return decodeJsonEscapes((html.match(a) || html.match(b) || [])[1] || '');
}

function mediaCandidates(html, baseUrl) {
  const out = [];
  const add = (raw, kind = 'auto') => {
    const u = abs(raw, baseUrl);
    if (!u) return;
    if (kind === 'video' && !/\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)|m3u8|video/i.test(u)) return;
    if (mediaUrl(u)) out.push({ url: u, kind });
  };

  for (const property of ['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream']) {
    const v = metaValue(html, property); if (v) add(v, 'video');
  }
  for (const property of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    const v = metaValue(html, property); if (v) add(v, 'image');
  }

  // Attribute and JSON-embedded media URLs.
  const re = /(?:src|data-src|data-original|data-url|content|href)\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) add(m[1]);

  const raw = /https?:\\?\/\\?\/[^\s"'<>\\]+/gi;
  for (const m of html.matchAll(raw)) add(m[0]);

  // Pinterest's CDN is often represented with width-transforming paths.
  const pinimg = /https?:\\?\/\\?\/i\.pinimg\.com\/[^\s"'<>\\]+/gi;
  for (const m of html.matchAll(pinimg)) add(m[0], 'image');

  const videos = unique(out.filter(x => x.kind === 'video').map(x => x.url));
  const images = unique(out.filter(x => x.kind !== 'video').map(x => x.url));
  return { videos, images };
}

function pinId(url) { const m = String(url).match(/\/pin\/(\d+)/i); return m ? m[1] : null; }

async function resolve(url) {
  if (!isHttp(url)) throw new Error('Invalid URL.');
  let page = await fetchText(url);
  let media = mediaCandidates(page.text, page.url);

  // Bounded public redirects/details only.
  if (!media.videos.length && !media.images.length) {
    const finalHtml = page.text;
    const canonical = metaValue(finalHtml, 'og:url');
    if (canonical && canonical !== page.url) {
      try {
        const p2 = await fetchText(canonical);
        media = mergeMedia(media, mediaCandidates(p2.text, p2.url));
        page = p2;
      } catch {}
    }
  }

  return {
    inputUrl: url,
    finalUrl: page.url,
    pinId: pinId(page.url) || pinId(url),
    title: metaValue(page.text, 'og:title') || metaValue(page.text, 'twitter:title') || clean((page.text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]),
    videos: unique(media.videos),
    images: unique(media.images),
  };
}

function mergeMedia(a, b) {
  return { videos: unique([...(a.videos || []), ...(b.videos || [])]), images: unique([...(a.images || []), ...(b.images || [])]) };
}

function ytdlp(url) {
  return new Promise(resolve => {
    const bin = process.env.YTDLP_BIN || 'yt-dlp';
    const args = ['-J', '--no-playlist', '--no-warnings', '--skip-download', url];
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), YTDLP_TIMEOUT_MS);
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.once('error', () => { clearTimeout(timer); resolve(null); });
    p.once('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) return resolve(null);
      try {
        const j = JSON.parse(stdout);
        const urls = [];
        if (j.url) urls.push(j.url);
        for (const f of j.formats || []) if (f.url) urls.push(f.url);
        resolve({ title: clean(j.title), urls: unique(urls) });
      } catch { resolve(null); }
    });
  });
}

async function resolveWithFallback(url) {
  const info = await resolve(url);
  if (!info.videos.length && !info.images.length) {
    const y = await ytdlp(info.finalUrl);
    if (y) {
      info.title = info.title || y.title;
      for (const u of y.urls) {
        if (/\.(?:mp4|webm|m3u8)(?:[?#]|$)/i.test(u) || /video/i.test(u)) info.videos.push(u);
      }
      info.videos = unique(info.videos);
    }
  }
  return info;
}

function ext(url, mime) {
  const t = String(mime || '').split(';')[0].toLowerCase();
  const map = {'image/gif': '.gif','image/webp': '.webp','image/jpeg': '.jpg','image/png': '.png','video/mp4': '.mp4','video/webm': '.webm','video/quicktime': '.mov'};
  if (map[t]) return map[t];
  try { const e = path.extname(new URL(url).pathname).toLowerCase(); if (/^\.(gif|webp|jpg|jpeg|png|mp4|webm|mov)$/.test(e)) return e; } catch {}
  return '.bin';
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let filePath = null, file = null;
  try {
    const r = await fetch(url, { redirect: 'follow', headers: {...HEADERS, Accept: 'image/*,video/*;q=0.9,*/*;q=0.1'}, signal: controller.signal });
    if (!r.ok) throw new Error(`media HTTP ${r.status}`);
    const mime = r.headers.get('content-type') || '';
    if (!/^(image|video)\//i.test(mime) && !/application\/octet-stream/i.test(mime)) throw new Error('URL did not return media');
    const length = Number(r.headers.get('content-length') || 0);
    if (length && length > MAX_BYTES) throw new Error('media exceeds size limit');
    fs.mkdirSync(TMP, {recursive:true});
    filePath = path.join(TMP, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext(r.url || url, mime)}`);
    file = fs.createWriteStream(filePath, {flags:'wx'});
    let total = 0;
    for await (const chunk of r.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new Error('media exceeds size limit');
      if (!file.write(chunk)) await new Promise((resolve, reject) => { file.once('drain', resolve); file.once('error', reject); });
    }
    await new Promise((resolve, reject) => { file.end(resolve); file.once('error', reject); });
    file = null;
    return {path:filePath, mime, url:r.url || url};
  } catch (e) {
    if (file) file.destroy();
    if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    throw e;
  } finally { clearTimeout(timer); }
}

function ffmpegExists() {
  return new Promise(resolve => { const p = spawn('ffmpeg',['-version'],{stdio:'ignore'}); p.once('error',()=>resolve(false)); p.once('close',c=>resolve(c===0)); });
}
function gifToMp4(input, output) {
  return new Promise((resolve,reject)=>{
    const p = spawn('ffmpeg',['-y','-i',input,'-vf','fps=15,scale=720:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=720:720:(ow-iw)/2:(oh-ih)/2:color=black@0','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-preset','veryfast','-crf','29','-t','12',output],{stdio:'ignore'});
    p.once('error',reject); p.once('close',c=>c===0?resolve():reject(new Error(`ffmpeg exit ${c}`)));
  });
}

async function sendMedia(sock, jid, message, item, title) {
  const saved = await download(item);
  const cleanup = [saved.path];
  let finalPath = saved.path;
  try {
    const e = path.extname(finalPath).toLowerCase();
    if (['.gif','.webm','.webp'].includes(e) && await ffmpegExists()) {
      const mp4 = saved.path + '.mp4';
      try { await gifToMp4(saved.path, mp4); finalPath = mp4; cleanup.push(mp4); } catch {}
    }
    const data = fs.readFileSync(finalPath);
    const finalExt = path.extname(finalPath).toLowerCase();
    const caption = title ? `📌 ${title}` : '📌 Pinterest';
    if (['.mp4','.webm','.mov'].includes(finalExt)) {
      return sock.sendMessage(jid, { video:data, mimetype:finalExt === '.webm' ? 'video/webm' : 'video/mp4', caption, gifPlayback:true }, {quoted:message});
    }
    return sock.sendMessage(jid, { image:data, mimetype:saved.mime || 'image/jpeg', caption }, {quoted:message});
  } finally { for (const f of cleanup) { try { fs.unlinkSync(f); } catch {} } }
}

function usage(prefix) {
  return [
    '📌 *PINTEREST DOWNLOADER*', '',
    `${prefix}pindl <Pinterest URL>`,
    `${prefix}pindl image <URL>`,
    `${prefix}pindl video <URL>`,
    `${prefix}pindl info <URL>`,
    `${prefix}pintest <Pinterest URL>`,
  ].join('\n');
}

async function executeCore({sock,message,args,context}) {
  const jid = context.chatId || message?.key?.remoteJid;
  if (!jid) return;
  const command = String(context.command || context.commandName || 'pindl').replace(/^[!./#$-]+/,'').toLowerCase();
  const prefix = context.prefix || '-';
  const list = Array.isArray(args) ? args.map(clean).filter(Boolean) : [];

  if (command === 'pintest') {
    const url = list[0];
    if (!url) return sock.sendMessage(jid,{text:usage(prefix)},{quoted:message});
    try {
      const info = await resolveWithFallback(url);
      return sock.sendMessage(jid,{text:[
        '🧪 *PINTEREST TEST*','',
        `Final URL: ${info.finalUrl || '—'}`,
        `Pin ID: ${info.pinId || '—'}`,
        `Title: ${info.title || '—'}`,
        `Video URLs: ${info.videos.length}`,
        `Image URLs: ${info.images.length}`,
        info.videos[0] ? `Video: ${info.videos[0]}` : 'Video: none',
        info.images[0] ? `Image: ${info.images[0]}` : 'Image: none',
      ].join('\n')},{quoted:message});
    } catch(e) { return sock.sendMessage(jid,{text:`❌ Pinterest test failed: ${clean(e.message)}`},{quoted:message}); }
  }

  let mode = 'auto';
  if (['image','video','info'].includes(String(list[0] || '').toLowerCase())) mode = String(list.shift()).toLowerCase();
  const url = list[0];
  if (!url) return sock.sendMessage(jid,{text:usage(prefix)},{quoted:message});

  if (busy.has(jid)) return sock.sendMessage(jid,{text:'⏳ A Pinterest download is already running in this chat.'},{quoted:message});
  if (Date.now() - (last.get(jid) || 0) < COOLDOWN_MS) return sock.sendMessage(jid,{text:'⏱️ Please wait a few seconds before another Pinterest download.'},{quoted:message});

  busy.add(jid); last.set(jid,Date.now());
  try {
    await sock.sendMessage(jid,{react:{text:'⏳',key:message.key}}).catch(()=>{});
    const info = await resolveWithFallback(url);
    if (mode === 'info') return sock.sendMessage(jid,{text:[
      '📌 *PINTEREST PIN INFO*','',`Title: ${info.title || '—'}`,`Pin ID: ${info.pinId || '—'}`,
      `Videos: ${info.videos.length}`,`Images: ${info.images.length}`,`Final URL: ${info.finalUrl}`,
    ].join('\n')},{quoted:message});

    let chosen;
    if (mode === 'video') chosen = info.videos[0];
    else if (mode === 'image') chosen = info.images[0];
    else chosen = info.videos[0] || info.images[0];
    if (!chosen) throw new Error('No public downloadable image/video was found on this Pin.');

    const kind = info.videos.includes(chosen) ? 'video' : 'image';
    await sendMedia(sock,jid,message,chosen,info.title);
    await sock.sendMessage(jid,{react:{text:'✅',key:message.key}}).catch(()=>{});
    return kind;
  } catch(e) {
    await sock.sendMessage(jid,{react:{text:'❌',key:message.key}}).catch(()=>{});
    return sock.sendMessage(jid,{text:`❌ Pinterest download failed: ${clean(e.message).slice(0,220)}`},{quoted:message});
  } finally { busy.delete(jid); }
}

module.exports = {
  command: 'pindl',
  aliases: ['pinterestdl','pindownload','pinterestvideo','pinvideo','pinterestdownloader','pintest'],
  category: 'download',
  permission: 'PUBLIC/DEFAULT',
  description: 'Download public Pinterest images/photos/videos without an API.',
  usage: '-pindl <URL> | -pindl image <URL> | -pindl video <URL> | -pintest <URL>',
  async handler(sock,message,args=[],context={}) { return executeCore({sock,message,args,context}); },
  async execute({sock,msg,from,args=[],prefix='-',...context}) { return executeCore({sock,message:msg,args,context:{...context,chatId:from,prefix}}); },
  async run({sock,m,args=[],context={}}) { return executeCore({sock,message:m,args,context}); },
  resolveWithFallback,
};
