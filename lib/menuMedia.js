'use strict';

const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '../assets');
const DATA_DIR = path.join(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'menu-media.json');
const LEGACY_STATE_PATH = path.join(ASSET_DIR, 'bot_top.json');
const LEGACY_VIDEO_PATH = path.join(ASSET_DIR, 'bot_top.mp4');
const IMAGE_BASENAME = 'bot_top_image';

function safeMimetype(value) {
  return String(value || '').toLowerCase().split(';')[0].trim();
}

function imageExtension(mimetype = '') {
  switch (safeMimetype(mimetype)) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'image/jpeg': return 'jpg';
    default: return 'jpg';
  }
}

function imageMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function parseStateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!state || !['image', 'gif', 'video'].includes(state.type)) return null;
    const relative = path.basename(String(state.file || ''));
    if (!relative) return null;
    const filePathResolved = path.join(ASSET_DIR, relative);
    if (!fs.existsSync(filePathResolved)) return null;
    return {
      type: state.type,
      file: relative,
      path: filePathResolved,
      mimetype: safeMimetype(state.mimetype),
      updatedAt: state.updatedAt || null,
      updatedBy: state.updatedBy || null,
    };
  } catch {
    return null;
  }
}

function readState() {
  const state = parseStateFile(STATE_PATH);
  if (state) return state;

  // Migrate the older asset-local metadata file automatically. This keeps
  // existing -setbottop selections working after the storage format changes.
  const legacy = parseStateFile(LEGACY_STATE_PATH);
  if (legacy) {
    try {
      writeState(legacy);
      return legacy;
    } catch {
      return legacy;
    }
  }

  return null;
}

function findLegacyImage() {
  const candidates = [
    'bot_top_image.jpg',
    'bot_top_image.jpeg',
    'bot_top_image.png',
    'bot_top_image.webp',
    'bot_top_image.gif',
  ];

  for (const file of candidates) {
    const filePath = path.join(ASSET_DIR, file);
    if (fs.existsSync(filePath)) {
      return {
        type: file.endsWith('.gif') ? 'gif' : 'image',
        file,
        path: filePath,
        mimetype: file.endsWith('.gif') ? 'image/gif' : imageMimeFromPath(filePath),
        updatedAt: null,
      };
    }
  }
  return null;
}

/**
 * Resolve the current bot-top asset. The persistent metadata lives in
 * data/menu-media.json while the actual media stays in assets/. The metadata
 * is authoritative after -setbottop; older assets/bot_top.json is migrated
 * automatically, and assets/bot_top.mp4 remains supported as the legacy
 * default video.
 */
function getBotTopMedia() {
  const state = readState();
  if (state) return state;

  const image = findLegacyImage();
  if (image) return image;

  if (fs.existsSync(LEGACY_VIDEO_PATH)) {
    return {
      type: 'video',
      file: 'bot_top.mp4',
      path: LEGACY_VIDEO_PATH,
      mimetype: 'video/mp4',
      updatedAt: null,
    };
  }

  return null;
}

function readBotTopBuffer() {
  const media = getBotTopMedia();
  if (!media) return null;
  return { ...media, buffer: fs.readFileSync(media.path) };
}

function buildBotTopMessage(caption, extra = {}) {
  const media = readBotTopBuffer();
  if (!media) return { text: String(caption || ''), ...extra };

  const base = {
    caption: String(caption || ''),
    contextInfo: {},
    ...extra,
  };

  if (media.type === 'image') {
    return {
      ...base,
      image: media.buffer,
      mimetype: media.mimetype || imageMimeFromPath(media.path),
    };
  }

  return {
    ...base,
    video: media.buffer,
    mimetype: 'video/mp4',
    gifPlayback: media.type === 'gif',
  };
}

function managedImageNames() {
  return [
    'bot_top_image.jpg',
    'bot_top_image.jpeg',
    'bot_top_image.png',
    'bot_top_image.webp',
    'bot_top_image.gif',
  ].map(file => path.join(ASSET_DIR, file));
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 2,
    type: state.type,
    file: state.file,
    mimetype: state.mimetype || '',
    updatedAt: state.updatedAt || new Date().toISOString(),
    updatedBy: state.updatedBy || null,
  }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, STATE_PATH);
}

function stageAndCommit({ type, buffer, mimetype = '', workDir, updatedBy = null }) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const targetName = type === 'image'
    ? `${IMAGE_BASENAME}.${imageExtension(mimetype)}`
    : 'bot_top.mp4';
  const targetPath = path.join(ASSET_DIR, targetName);
  const stagePath = path.join(workDir, `bot-top-stage-${Date.now()}-${Math.random().toString(16).slice(2)}.${path.extname(targetName).slice(1)}`);
  fs.writeFileSync(stagePath, buffer);

  const oldPath = fs.existsSync(targetPath)
    ? `${targetPath}.previous-${Date.now()}`
    : null;

  if (oldPath) fs.renameSync(targetPath, oldPath);

  const stalePaths = [LEGACY_VIDEO_PATH, ...managedImageNames()]
    .filter(filePath => filePath !== targetPath && fs.existsSync(filePath));
  const staleBackups = [];
  try {
    for (const filePath of stalePaths) {
      const backup = `${filePath}.previous-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fs.renameSync(filePath, backup);
      staleBackups.push([filePath, backup]);
    }

    fs.renameSync(stagePath, targetPath);
    writeState({
      type,
      file: targetName,
      mimetype: type === 'image' ? (mimetype || imageMimeFromPath(targetPath)) : 'video/mp4',
      updatedBy,
    });

    for (const [, backup] of [[targetPath, oldPath], ...staleBackups]) {
      if (backup && fs.existsSync(backup)) {
        try { fs.unlinkSync(backup); } catch {}
      }
    }

    return targetPath;
  } catch (error) {
    try { if (fs.existsSync(stagePath)) fs.unlinkSync(stagePath); } catch {}
    try { if (oldPath && fs.existsSync(oldPath) && !fs.existsSync(targetPath)) fs.renameSync(oldPath, targetPath); } catch {}
    for (let i = staleBackups.length - 1; i >= 0; i--) {
      const [original, backup] = staleBackups[i];
      try {
        if (fs.existsSync(backup) && !fs.existsSync(original)) fs.renameSync(backup, original);
      } catch {}
    }
    throw error;
  }
}

module.exports = {
  ASSET_DIR,
  STATE_PATH,
  LEGACY_VIDEO_PATH,
  IMAGE_BASENAME,
  imageExtension,
  getBotTopMedia,
  readBotTopBuffer,
  buildBotTopMessage,
  stageAndCommit,
};
