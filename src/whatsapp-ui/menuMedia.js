import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store alongside the existing data/auth/ Baileys session directory
// (project root data/), rather than nested inside src/.
const MEDIA_DIR = path.join(__dirname, '../../data/menu-media');
const META_PATH = path.join(__dirname, '../../data/menu-media/meta.json');

const EXT_BY_TYPE = {
  image: '.jpg',
  video: '.mp4',
  gif: '.mp4', // WhatsApp gifs are actually mp4 with gifPlayback=true
};

function ensureDirs() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(path.dirname(META_PATH))) {
    fs.mkdirSync(path.dirname(META_PATH), { recursive: true });
  }
}

/**
 * Saves the given buffer as the menu's header media and records its type.
 * @param {'image'|'video'|'gif'} type
 * @param {Buffer} buffer
 */
export function setMenuMedia(type, buffer) {
  if (!EXT_BY_TYPE[type]) {
    throw new Error(`Unsupported menu media type: ${type}`);
  }
  ensureDirs();

  // Remove any previous menu media file so stale files don't linger.
  clearMenuMedia();

  const fileName = `menu${EXT_BY_TYPE[type]}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  fs.writeFileSync(META_PATH, JSON.stringify({ type, fileName }, null, 2));

  return filePath;
}

/**
 * Returns { type, buffer } for the currently configured menu media,
 * or null if none has been set.
 */
export function getMenuMedia() {
  ensureDirs();
  if (!fs.existsSync(META_PATH)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const filePath = path.join(MEDIA_DIR, meta.fileName);
    if (!fs.existsSync(filePath)) return null;
    return { type: meta.type, buffer: fs.readFileSync(filePath) };
  } catch {
    return null;
  }
}

export function clearMenuMedia() {
  ensureDirs();
  if (fs.existsSync(META_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
      const filePath = path.join(MEDIA_DIR, meta.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore corrupt metadata, we're clearing anyway
    }
    fs.unlinkSync(META_PATH);
  }
}
