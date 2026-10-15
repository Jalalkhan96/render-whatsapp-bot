const axios = require('axios');
const dns = require('dns').promises;
const { fileTypeFromBuffer } = require('file-type');

const MAX_RESULTS = Math.min(20, Math.max(1, Number(process.env.IMAGE_SEARCH_RESULTS) || 10));
const SESSION_TTL = Math.max(60_000, Number(process.env.IMAGE_SEARCH_SESSION_TTL) || 300_000);
const MAX_BYTES = Math.max(1, Number(process.env.IMAGE_MAX_SIZE_MB) || 10) * 1024 * 1024;
const TIMEOUT = Math.max(1000, Number(process.env.IMAGE_SEARCH_TIMEOUT) || 15_000);
const sessions = new Map();
const requests = new Map();

function prune() {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expiresAt <= now) sessions.delete(key);
  for (const [key, values] of requests) {
    const active = values.filter(timestamp => timestamp > now - 60_000);
    if (active.length) requests.set(key, active);
    else requests.delete(key);
  }
}

function assertQuery(query) {
  const value = String(query || '').trim();
  if (!value) throw new Error('Image search query required');
  if (value.length > 160) throw new Error('Image search query is too long');
  return value;
}

function allowSearch(userKey) {
  prune();
  const key = String(userKey || 'unknown');
  const values = requests.get(key) || [];
  const max = Math.max(1, Number(process.env.IMAGE_SEARCH_MAX_REQUESTS) || 5);
  if (values.length >= max) return false;
  values.push(Date.now());
  requests.set(key, values);
  return true;
}

function normalizeResult(item, index) {
  const imageUrl = item.imageUrl || item.urls?.regular || item.largeImageURL || item.webformatURL;
  if (!/^https?:\/\//i.test(String(imageUrl || ''))) return null;
  return {
    id: String(item.id || index),
    title: String(item.title || item.alt_description || item.tags || 'Image result').trim().slice(0, 160),
    imageUrl,
    thumbnailUrl: item.thumbnailUrl || item.urls?.small || item.previewURL || imageUrl,
    sourceUrl: item.sourceUrl || item.links?.html || item.pageURL || imageUrl,
    width: Number(item.width || item.imageWidth) || null,
    height: Number(item.height || item.imageHeight) || null
  };
}

async function searchProvider(query) {
  const provider = String(process.env.IMAGE_SEARCH_PROVIDER || '').toLowerCase();
  const apiKey = process.env.IMAGE_SEARCH_API_KEY;
  const apiUrl = process.env.IMAGE_SEARCH_API_URL;
  let response;

  if (provider === 'unsplash') {
    if (!apiKey) throw new Error('IMAGE_SEARCH_API_KEY is not configured for Unsplash');
    response = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: MAX_RESULTS },
      headers: { Authorization: `Client-ID ${apiKey}` },
      timeout: TIMEOUT
    });
    return response.data?.results || [];
  }
  if (provider === 'pixabay') {
    if (!apiKey) throw new Error('IMAGE_SEARCH_API_KEY is not configured for Pixabay');
    response = await axios.get('https://pixabay.com/api/', {
      params: { key: apiKey, q: query, image_type: 'photo', per_page: MAX_RESULTS, safesearch: true },
      timeout: TIMEOUT
    });
    return response.data?.hits || [];
  }
  if (!apiUrl) throw new Error('Image search provider is not configured');
  response = await axios.get(apiUrl, {
    params: { q: query, query, limit: MAX_RESULTS, api_key: apiKey || undefined },
    timeout: TIMEOUT
  });
  const values = response.data?.results || response.data?.items || response.data?.images || [];
  return Array.isArray(values) ? values : [];
}

async function search(query, userKey) {
  const cleanQuery = assertQuery(query);
  if (!allowSearch(userKey)) throw new Error('Image search rate limit reached. Try again in a minute.');
  const raw = await searchProvider(cleanQuery);
  const unique = new Map();
  raw.map(normalizeResult).filter(Boolean).forEach(result => {
    if (!unique.has(result.imageUrl)) unique.set(result.imageUrl, result);
  });
  return [...unique.values()].slice(0, MAX_RESULTS);
}

function saveSession(userKey, query, results, page = 1) {
  prune();
  const key = String(userKey);
  const session = { userJid: key, query, results, page, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL };
  sessions.set(key, session);
  return session;
}

function getSession(userKey) {
  prune();
  const session = sessions.get(String(userKey));
  if (!session) return null;
  return session;
}

function clearSession(userKey) {
  sessions.delete(String(userKey));
}

async function validatePublicUrl(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported image URL');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private image URL rejected');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  for (const address of addresses) {
    const ip = address.address;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip)) {
      throw new Error('Private image URL rejected');
    }
  }
  return url.toString();
}

async function downloadImage(value) {
  const url = await validatePublicUrl(value);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: TIMEOUT,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    headers: { Accept: 'image/*', 'User-Agent': 'ABIX-AE Image Search/1.0' }
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length > MAX_BYTES) throw new Error('This image is too large to send');
  const type = await fileTypeFromBuffer(buffer);
  const contentType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
  const mime = type?.mime || contentType;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
    throw new Error('This result is not a supported image');
  }
  return { buffer, mime };
}

module.exports = {
  SESSION_TTL,
  MAX_BYTES,
  assertQuery,
  normalizeResult,
  search,
  saveSession,
  getSession,
  clearSession,
  validatePublicUrl,
  downloadImage
};
