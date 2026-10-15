'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'welcome-media.json');
const ASSET_DIR = path.join(ROOT, 'assets', 'welcome');
const WIDTH = 1024;
const HEIGHT = 576;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

function defaultState() {
  return { version: 1, groups: {} };
}

function readState() {
  ensureDirs();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') return defaultState();
    if (!raw.groups || typeof raw.groups !== 'object') raw.groups = {};
    raw.version = Number(raw.version) || 1;
    return raw;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  ensureDirs();
  const temp = `${STATE_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STATE_PATH);
}

function groupKey(jid) {
  return crypto.createHash('sha256').update(String(jid)).digest('hex').slice(0, 24);
}

function sanitizeGroupJid(jid) {
  return String(jid || '').trim();
}

function getWelcomeMedia(jid) {
  const groupId = sanitizeGroupJid(jid);
  if (!groupId) return null;
  const state = readState();
  const entry = state.groups[groupId];
  if (!entry || !entry.file) return null;
  const filePath = path.join(ROOT, entry.file);
  if (!fs.existsSync(filePath)) return null;
  return { ...entry, path: filePath };
}

function removeWelcomeMedia(jid) {
  const groupId = sanitizeGroupJid(jid);
  const state = readState();
  const entry = state.groups[groupId];
  if (entry?.file) {
    const filePath = path.join(ROOT, entry.file);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }
  delete state.groups[groupId];
  writeState(state);
}

async function setWelcomeMedia(jid, buffer, sourceMime = 'image/jpeg') {
  const groupId = sanitizeGroupJid(jid);
  if (!groupId) throw new Error('Invalid group ID.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Image data is empty.');
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('Image is too large. Maximum is 8 MB.');

  ensureDirs();
  const key = groupKey(groupId);
  const targetName = `welcome-${key}.png`;
  const targetRelative = path.join('assets', 'welcome', targetName).replace(/\\/g, '/');
  const targetPath = path.join(ROOT, targetRelative);
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;

  // Use sharp when available so JPG/WEBP/GIF first frames become a predictable PNG.
  let normalized = buffer;
  try {
    const sharp = require('sharp');
    normalized = await sharp(buffer, { animated: false })
      .rotate()
      .resize({ width: 1600, height: 900, fit: 'cover', position: 'attention' })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (error) {
    const normalizedMime = String(sourceMime || '').split(';')[0].toLowerCase();
    if (!normalizedMime.includes('png')) {
      throw new Error(`Image conversion is unavailable (${error.message}). Please reinstall dependencies with npm ci.`);
    }
  }

  fs.writeFileSync(tempPath, normalized);
  fs.renameSync(tempPath, targetPath);

  const state = readState();
  const previous = state.groups[groupId];
  if (previous?.file && previous.file !== targetRelative) {
    const oldPath = path.join(ROOT, previous.file);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
  }
  state.groups[groupId] = {
    version: 1,
    file: targetRelative,
    sourceMime: String(sourceMime || 'image/jpeg').split(';')[0],
    updatedAt: new Date().toISOString(),
  };
  writeState(state);
  return getWelcomeMedia(groupId);
}

async function fetchImageBuffer(url) {
  try {
    if (!url) return null;
    const response = await fetch(url, { timeout: 10000 });
    if (!response.ok) return null;
    const buffer = await response.buffer();
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, initialSize, minSize = 18) {
  let size = initialSize;
  while (size > minSize) {
    ctx.font = `700 ${size}px Sans`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderWelcomeCard({ backgroundBuffer, avatarBuffer, groupName, displayName, memberCount, timeString }) {
  let canvasModule;
  try {
    canvasModule = require('@napi-rs/canvas');
  } catch (error) {
    throw new Error(`@napi-rs/canvas is unavailable: ${error.message}`);
  }

  const { createCanvas, loadImage } = canvasModule;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  if (backgroundBuffer) {
    try {
      const bg = await loadImage(backgroundBuffer);
      const scale = Math.max(WIDTH / bg.width, HEIGHT / bg.height);
      const bw = bg.width * scale;
      const bh = bg.height * scale;
      ctx.drawImage(bg, (WIDTH - bw) / 2, (HEIGHT - bh) / 2, bw, bh);
    } catch {
      backgroundBuffer = null;
    }
  }

  if (!backgroundBuffer) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#08090d');
    gradient.addColorStop(0.55, '#161a24');
    gradient.addColorStop(1, '#071019');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(80 + i * 110, 90 + (i % 3) * 180, 60 + (i % 2) * 20, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#5ef2a3' : '#4aa3ff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  overlay.addColorStop(0, 'rgba(4,7,12,0.28)');
  overlay.addColorStop(0.55, 'rgba(4,7,12,0.56)');
  overlay.addColorStop(1, 'rgba(4,7,12,0.88)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(8, 12, 20, 0.76)';
  roundRect(ctx, 44, 44, 936, 488, 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(94,242,163,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#5ef2a3';
  roundRect(ctx, 72, 74, 190, 42, 20);
  ctx.fill();
  ctx.fillStyle = '#07110d';
  ctx.font = '700 22px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ABIX • WELCOME', 167, 95);

  let avatar;
  if (avatarBuffer) {
    try { avatar = await loadImage(avatarBuffer); } catch {}
  }
  const ax = 126;
  const ay = 180;
  const ar = 82;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#273241';
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d7e0ea';
    ctx.font = '700 54px Sans';
    ctx.fillText(String(displayName || 'U').trim().charAt(0).toUpperCase(), ax, ay + 2);
  }
  ctx.strokeStyle = '#5ef2a3';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9eef4';
  const member = String(displayName || 'New member').trim() || 'New member';
  const nameSize = fitText(ctx, member, 650, 48, 26);
  ctx.font = `700 ${nameSize}px Sans`;
  ctx.fillText(member, 250, 176);

  ctx.fillStyle = '#a7b2c2';
  ctx.font = '500 26px Sans';
  ctx.fillText('has joined the group', 250, 218);

  ctx.fillStyle = '#ffffff';
  const group = String(groupName || 'ABIX Group').trim() || 'ABIX Group';
  const groupSize = fitText(ctx, group, 650, 40, 22);
  ctx.font = `700 ${groupSize}px Sans`;
  ctx.fillText(group, 250, 270);

  const lineY = 318;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(84, lineY);
  ctx.lineTo(940, lineY);
  ctx.stroke();

  const info = [
    ['MEMBERS', String(memberCount || '—')],
    ['TIME', String(timeString || '—')],
    ['STATUS', 'WELCOME'],
  ];
  const colXs = [90, 355, 690];
  info.forEach(([label, value], index) => {
    ctx.fillStyle = '#8390a3';
    ctx.font = '600 17px Sans';
    ctx.fillText(label, colXs[index], 365);
    ctx.fillStyle = '#e8f0f6';
    ctx.font = '700 23px Sans';
    const valSize = fitText(ctx, value, 230, 23, 16);
    ctx.font = `700 ${valSize}px Sans`;
    ctx.fillText(value, colXs[index], 402);
  });

  ctx.fillStyle = '#5ef2a3';
  ctx.font = '700 23px Sans';
  ctx.fillText('Be respectful • Stay active • Enjoy your stay', 90, 470);

  ctx.fillStyle = '#778396';
  ctx.font = '500 18px Sans';
  ctx.fillText('ABIX-AE • Automated welcome system', 90, 505);

  return canvas.toBuffer('image/png');
}

module.exports = {
  STATE_PATH,
  ASSET_DIR,
  MAX_INPUT_BYTES,
  getWelcomeMedia,
  setWelcomeMedia,
  removeWelcomeMedia,
  fetchImageBuffer,
  renderWelcomeCard,
};
