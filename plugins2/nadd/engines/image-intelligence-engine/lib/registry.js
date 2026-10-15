'use strict';
/**
 * Source registry: exactly 100 adapters. Single source of truth lives in
 * sources/<id>.js; this module loads, validates, and exposes registry entries.
 */
const path = require('path');

const IDS = [
  // 1-17: verified APIs
  'unsplash', 'pexels', 'pixabay', 'openverse', 'wikimedia', 'flickr', 'nasa',
  'smithsonian', 'europeana', 'loc', 'dpla', 'internetarchive', 'wallhaven',
  // 14-22: best-effort APIs/feeds (endpointVerified:false)
  'nypl', 'picryl', 'digitalnz', 'harvard', 'wellcome',
  'met', 'aic', 'cleveland', 'rijksmuseum',
  // 23-44: free-stock photo pages (+7 additions)
  'stocksnap', 'burst', 'kaboompics', 'reshot', 'gratisography', 'lifeofpix',
  'picjumbo', 'negativespace', 'isorepublic', 'picography', 'freestocks',
  'splitshire', 'foodiesfeed', 'travelcoffeebook', 'skitterphoto', 'pxhere',
  'rawpixel', 'morguefile', 'freeimages', 'stockvault', 'newoldstock', 'magdeleine',
  // 45-51: public-domain / cultural pages
  'pdreview', 'bhl', 'yale', 'stanford', 'nga', 'getty', 'britishlibrary',
  // 52-61: illustration pages
  'undraw', 'opendoodles', 'humaaans', 'openpeeps', 'iradesign', 'drawkit',
  'storyset', 'manypixels', 'blush', 'ouch',
  // 62-71: vector/icon pages
  'svgrepo', 'openclipart', 'freepik', 'vecteezy', 'flaticon', 'iconmonstr',
  'iconarchive', 'findicons', 'iconduck', 'iconpark',
  // 72-91: open-source icon packages (jsDelivr)
  'openmoji', 'twemoji', 'heroicons', 'lucide', 'tabler', 'phosphor',
  'fontawesome', 'materialsymbols', 'pictogrammers', 'simpleicons', 'feather',
  'remixicon', 'bootstrapicons', 'radixicons', 'iconoir', 'evicons', 'cssgg',
  'fluenticons', 'boxicons', 'maki',
  // 92-100: wallpaper pages
  'wallpaperabyss', 'wallpaperaccess', 'wallpaperscraft', 'wallpaperflare',
  'wallpaperswide', 'hdqwalls', 'alphacoders', 'fourkwallpapers', 'interfacelift',
];

const REQUIRED_FIELDS = [
  'id', 'name', 'website', 'type', 'transport', 'docsUrl', 'enabled', 'priority',
  'categories', 'capabilities', 'rateLimit', 'defaultLicense', 'search', 'mapResult',
];

function loadAdapter(id) {
  const a = require(path.join(__dirname, '..', 'sources', id + '.js'));
  for (const f of REQUIRED_FIELDS) {
    if (a[f] === undefined) throw new Error(`sources/${id}.js missing field: ${f}`);
  }
  if (a.id !== id) throw new Error(`sources/${id}.js id mismatch: ${a.id}`);
  if (typeof a.search !== 'function' || typeof a.mapResult !== 'function') {
    throw new Error(`sources/${id}.js search/mapResult must be functions`);
  }
  return {
    id: a.id, name: a.name, website: a.website, type: a.type, transport: a.transport,
    enabled: a.enabled !== false, priority: a.priority, tags: a.tags || [],
    categories: a.categories || [], capabilities: a.capabilities, rateLimit: a.rateLimit,
    requiresKey: !!a.requiresKey, envKey: a.envKey || null,
    docsUrl: a.docsUrl || '', endpointVerified: !!a.endpointVerified,
    defaultLicense: a.defaultLicense || {},
    _adapter: a,
  };
}

let _cache = null;
function all() {
  if (!_cache) {
    const seen = new Set();
    _cache = IDS.map((id) => {
      if (seen.has(id)) throw new Error(`duplicate registry id: ${id}`);
      seen.add(id);
      return loadAdapter(id);
    });
    if (_cache.length !== 100) throw new Error(`registry must have 100 sources, has ${_cache.length}`);
  }
  return _cache;
}

function getById(id) { return all().find((s) => s.id === id); }
function byType(type) { return all().filter((s) => s.type === type); }

module.exports = { IDS, all, getById, byType };
