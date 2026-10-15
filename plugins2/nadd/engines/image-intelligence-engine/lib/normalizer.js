'use strict';
/**
 * Normalizes a raw adapter result into the UNIVERSAL image object
 * (prompt section 7). Fills defaults, never invents license info:
 * missing license -> license 'Unknown', licenseUnknown:true.
 */
const { licenseTypeOf } = require('./license');

const UNIVERSAL_KEYS = [
  'id', 'source', 'sourceId', 'sourceUrl', 'imageUrl', 'thumbnailUrl', 'downloadUrl',
  'title', 'description', 'creator', 'creatorUrl', 'width', 'height', 'aspectRatio',
  'format', 'filesize', 'license', 'licenseUrl', 'licenseType', 'attributionRequired',
  'commercialUse', 'modificationAllowed', 'tags', 'categories', 'colors', 'orientation',
  'safe', 'publishedAt', 'createdAt', 'updatedAt', 'metadata', 'licenseUnknown', 'alsoFrom',
];

function orientationOf(w, h) {
  if (!w || !h) return '';
  const r = w / h;
  if (r > 1.25) return 'landscape';
  if (r < 0.8) return 'portrait';
  return 'square';
}

function tri(v) {
  // boolean-or-null: undefined -> null, anything else -> bool (null stays null)
  if (v === undefined || v === null) return null;
  return !!v;
}

function normalize(raw, adapter) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const w = Number(r.width) || 0;
  const h = Number(r.height) || 0;
  // 'Unknown' (or missing) license stays unknown: never keep a licenseUrl
  // that isn't attached to a real license statement.
  const licUnknown = !r.license || r.license === 'Unknown';
  const license = licUnknown ? 'Unknown' : String(r.license);

  const img = {
    id: String(r.id || r.sourceId || ''),
    source: adapter.name || adapter.id,
    sourceKey: adapter.id,
    sourceId: String(r.sourceId || r.id || ''),
    sourceUrl: r.sourceUrl || '',
    imageUrl: r.imageUrl || '',
    thumbnailUrl: r.thumbnailUrl || r.imageUrl || '',
    downloadUrl: r.downloadUrl || r.imageUrl || '',
    title: String(r.title || '').slice(0, 300),
    description: String(r.description || '').slice(0, 1000),
    creator: String(r.creator || ''),
    creatorUrl: r.creatorUrl || '',
    width: w,
    height: h,
    aspectRatio: (w && h) ? +(w / h).toFixed(3) : 0,
    format: String(r.format || '').toLowerCase(),
    filesize: Number(r.filesize) || 0,
    license,
    licenseUrl: licUnknown ? '' : (r.licenseUrl || ''),
    licenseType: r.licenseType || licenseTypeOf(license),
    attributionRequired: tri(r.attributionRequired),
    commercialUse: tri(r.commercialUse),
    modificationAllowed: tri(r.modificationAllowed),
    tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 30) : [],
    categories: Array.isArray(r.categories) ? r.categories.map(String).slice(0, 10) : [],
    colors: Array.isArray(r.colors) ? r.colors.map(String).slice(0, 10) : [],
    orientation: r.orientation || orientationOf(w, h),
    safe: r.safe === undefined ? true : !!r.safe,
    publishedAt: r.publishedAt || '',
    createdAt: r.createdAt || '',
    updatedAt: r.updatedAt || '',
    metadata: (r.metadata && typeof r.metadata === 'object') ? r.metadata : {},
    licenseUnknown: licUnknown,
    alsoFrom: [],
  };
  if (!img.id) img.id = `${adapter.id}:${img.sourceId || img.imageUrl || Date.now()}`;
  return img;
}

module.exports = { normalize, UNIVERSAL_KEYS, orientationOf };
