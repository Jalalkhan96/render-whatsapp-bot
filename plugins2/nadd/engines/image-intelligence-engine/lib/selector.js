'use strict';
/**
 * Smart source selection: command -> curated source list (never all 100
 * unless 'imageall'). Honors IMAGE_MAX_SOURCES_PER_QUERY, skips disabled and
 * unhealthy sources, and rotates the starting offset for repeated identical
 * queries so the same sources are not hammered every time.
 */

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

const COMMAND_SOURCE_MAP = {
  image: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  img: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  photo: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  photos: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  picture: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  pic: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  freeimage: ['unsplash', 'pexels', 'pixabay', 'stocksnap', 'pxhere', 'openverse', 'wikimedia'],
  illustration: ['undraw', 'storyset', 'drawkit', 'manypixels', 'blush', 'opendoodles', 'openpeeps', 'humaaans', 'iradesign', 'svgrepo'],
  icon: ['svgrepo', 'iconmonstr', 'lucide', 'tabler', 'phosphor', 'heroicons', 'materialsymbols', 'bootstrapicons', 'radixicons', 'iconduck'],
  vector: ['svgrepo', 'openclipart', 'freepik', 'vecteezy', 'iconduck'],
  wallpaper: ['wallhaven', 'wallpaperabyss', 'wallpaperaccess', 'wallpaperscraft', 'wallpaperflare', 'wallpaperswide', 'hdqwalls', 'alphacoders', 'fourkwallpapers', 'interfacelift'],
  publicdomain: ['wikimedia', 'openverse', 'loc', 'smithsonian', 'nypl', 'europeana', 'picryl', 'internetarchive', 'met', 'aic', 'cleveland', 'rijksmuseum', 'dpla'],
  pd: ['wikimedia', 'openverse', 'loc', 'smithsonian', 'nypl', 'europeana', 'picryl', 'internetarchive', 'met', 'aic', 'cleveland', 'rijksmuseum', 'dpla'],
  ccimage: ['openverse', 'wikimedia', 'stocksnap', 'pxhere', 'picryl'],
  cc0: ['openverse', 'wikimedia', 'stocksnap', 'pxhere', 'picryl'],
  openimage: ['openverse', 'wikimedia', 'stocksnap', 'pxhere', 'unsplash', 'pexels', 'pixabay'],
  bestimage: ['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia'],
  commercialimage: ['stocksnap', 'pxhere', 'unsplash', 'pexels', 'pixabay', 'openverse'],
  imagecompare: ['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia'],
  imgurl: ['unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia'],
};

// rotation state: queryKey -> next starting offset
const rotationOffsets = new Map();

function selectSources(command, query, options = {}, sources = [], health = null) {
  const cmd = String(command || 'image').toLowerCase();
  let ids = COMMAND_SOURCE_MAP[cmd];
  if (cmd === 'imageall' || !ids) {
    // relevance-ordered: priority order (registry priorities are relevance-tuned)
    ids = [...sources].sort((a, b) => a.priority - b.priority).map((s) => s.id);
  }
  const maxSources = options.maxSources || envInt('IMAGE_MAX_SOURCES_PER_QUERY', 10);

  // rotate starting offset for repeated identical queries
  const rkey = cmd + '::' + String(query || '').toLowerCase();
  const start = (rotationOffsets.get(rkey) || 0) % Math.max(1, ids.length);
  rotationOffsets.set(rkey, (start + maxSources) % Math.max(1, ids.length));
  const rotated = [...ids.slice(start), ...ids.slice(0, start)];

  const out = [];
  for (const id of rotated) {
    if (out.length >= maxSources) break;
    const s = sources.find((x) => x.id === id);
    if (!s || !s.enabled) continue;
    if (health) {
      const st = health.getStatus(id).status;
      if (st === 'inactive' || st === 'auth_required') continue; // skip dead/keyless
    }
    out.push(s);
  }
  return out;
}

module.exports = { COMMAND_SOURCE_MAP, selectSources };
