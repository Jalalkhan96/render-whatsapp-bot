import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTikTokProfile } from './tiktok-profile-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 12 * 1024;
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) continue;
      const match = clean.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch {}
}
loadEnv(path.join(__dirname, '.env'));

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }); }
}

function allowedAvatarHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  const domains = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibytedtos.com', 'byteoversea.com'];
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

async function serveAvatar(url, res) {
  let parsed;
  try { parsed = new URL(url); } catch { return send(res, 400, JSON.stringify({ error: 'Invalid avatar URL.' })); }
  if (parsed.protocol !== 'https:' || !allowedAvatarHost(parsed.hostname)) {
    return send(res, 400, JSON.stringify({ error: 'Avatar host is not allowed.' }));
  }
  try {
    const response = await fetch(parsed, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'image/*' } });
    let finalUrl;
    try { finalUrl = new URL(response.url); } catch { return send(res, 502, JSON.stringify({ error: 'Invalid avatar response.' })); }
    if (!response.ok || !allowedAvatarHost(finalUrl.hostname)) return send(res, 502, JSON.stringify({ error: 'Avatar source refused the request.' }));
    const contentType = String(response.headers.get('content-type') || '');
    if (!contentType.startsWith('image/')) return send(res, 502, JSON.stringify({ error: 'Avatar source returned a non-image.' }));
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_AVATAR_BYTES) return send(res, 413, JSON.stringify({ error: 'Avatar is too large.' }));
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) return send(res, 413, JSON.stringify({ error: 'Avatar is empty or too large.' }));
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=1800',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.end(buffer);
  } catch {
    send(res, 502, JSON.stringify({ error: 'Could not fetch the TikTok avatar.' }));
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'POST' && parsedUrl.pathname === '/api/tiktok-profile') {
    try {
      const body = await readJson(req);
      const profile = await fetchTikTokProfile(body.username);
      return send(res, 200, JSON.stringify(profile));
    } catch (error) {
      const status = Number(error?.statusCode) || (/not configured/i.test(error?.message || '') ? 503 : /invalid username|TikTok profile URL|give a TikTok/i.test(error?.message || '') ? 400 : 502);
      return send(res, status, JSON.stringify({ error: String(error?.message || 'Profile lookup failed.').slice(0, 240) }));
    }
  }
  if (req.method === 'GET' && parsedUrl.pathname === '/api/avatar') {
    return serveAvatar(parsedUrl.searchParams.get('url') || '', res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, JSON.stringify({ error: 'Method not allowed.' }));

  const routes = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/default_pfp.jpg', ['default_pfp.jpg', 'image/jpeg']],
  ]);
  const route = routes.get(parsedUrl.pathname);
  if (!route) return send(res, 404, JSON.stringify({ error: 'Not found.' }));
  try {
    const filePath = path.join(PUBLIC_DIR, route[0]);
    const stat = await fsp.stat(filePath);
    res.writeHead(200, {
      'Content-Type': route[1],
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch {
    send(res, 500, JSON.stringify({ error: 'Could not read the card maker UI.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[TikTok Card Maker] http://${HOST}:${PORT}`);
  if (!(process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN)) {
    console.warn('[TikTok Card Maker] APIFY_API_TOKEN is not set; profile lookup will not work until configured.');
  }
});
