const axios = require('axios');

// ============================================================
//  CRICKET DRIVE (Google Drive via Apps Script /exec)  commonJS
//  drive se random photo/video: single CRICKET_API_URL?type=
//  ya phir per-type CRICKET_BABAR/AMIR/VIDEO_API_URL. Dono chalte hain
// ============================================================

const NEWS_CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const NEWS_CHANNEL_NAME = process.env.NEWSLETTER_NAME || 'ABIX-AE';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: NEWS_CHANNEL_JID,
    newsletterName: NEWS_CHANNEL_NAME,
    serverMessageId: -1
  }
};

const CACHE_TIME = 10 * 60 * 1000;
const cache = new Map();

// single API URL support (pasted cricketDrive.js style)
const SINGLE_API_URL = (process.env.CRICKET_API_URL || '').trim();
const API_URLS = {
  babar: (process.env.CRICKET_BABAR_API_URL || '').trim(),
  amir: (process.env.CRICKET_AMIR_API_URL || '').trim(),
  video: (process.env.CRICKET_VIDEO_API_URL || '').trim()
};

function resolveUrl(type) {
  if (SINGLE_API_URL && !/PASTE|PLACEHOLDER|exec\.googleapis\.com\/apps.*utm_source=placeholder/i.test(SINGLE_API_URL)) {
    return SINGLE_API_URL;
  }
  return API_URLS[type] || '';
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getFileId(item) {
  return item?.id || item?.url?.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/)?.[1] || '';
}

function getDriveUrl(item) {
  const id = getFileId(item);
  if (!id) return '';
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

function getDriveViewUrl(item) {
  const id = getFileId(item);
  if (!id) return '';
  return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

async function getCricketAsset(type) {
  const apiUrl = resolveUrl(type);
  if (!apiUrl) {
    throw new Error(`CRICKET_${type.toUpperCase()}_API_URL ya CRICKET_API_URL .env mein set nahi hai. Naye Drive /exec URL ko .env mein rakhein.`);
  }

  const cached = cache.get(type);
  if (cached && Date.now() - cached.time < CACHE_TIME) return cached.items;

  let response;
  try {
    response = await axios.get(apiUrl, {
      params: { type, t: Date.now() },
      timeout: 12000,
      maxRedirects: 5
    });
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new Error('Drive API response nahi de raha. CRICKET_API_URL ko check karein — Internet/Apps Script timing out hai.');
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Drive API access denied. Apps Script ko "Anyone" par redeploy karein.');
    }
    throw new Error(`Drive ${type} request fail: ${error.response?.status || error.message}`);
  }

  let data = response.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (error) {
      const preview = data.replace(/\s+/g, ' ').slice(0, 100);
      throw new Error(`Drive ${type} API JSON nahi bhej rahi. URL /exec hona chahiye. Response: ${preview}`);
    }
  }
  if (data?.data && typeof data.data === 'string') {
    try { data.data = JSON.parse(data.data); } catch (error) {}
  }
  if (!data?.success || (!Array.isArray(data.data) && !data.data?.id)) {
    throw new Error(data?.error || `Drive ${type} API ka response invalid hai. Naye /exec URL check karein.`);
  }

  const items = Array.isArray(data.data) ? data.data : [data.data];
  if (!items.length) throw new Error(`Drive ${type} API ne koi matching file nahi di. Apps Script ko redeploy karein.`);

  cache.set(type, { items, time: Date.now() });
  return items;
}

async function downloadDriveImage(item) {
  const url = getDriveUrl(item);
  if (!url) throw new Error('Image file ID nahi mili');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 12 * 1024 * 1024
  });
  return Buffer.from(response.data);
}

async function downloadDriveVideo(item) {
  const url = getDriveUrl(item);
  if (!url) throw new Error('Video file ID nahi mili');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 400 * 1024 * 1024
  });
  return Buffer.from(response.data);
}

async function downloadOptionalThumbnail(item) {
  const id = getFileId(item);
  if (!id) return undefined;
  try {
    const response = await axios.get(`https://drive.google.com/thumbnail?id=${id}&sz=w640`, {
      responseType: 'arraybuffer',
      timeout: 12000,
      maxContentLength: 2 * 1024 * 1024
    });
    return Buffer.from(response.data);
  } catch (error) {
    return undefined;
  }
}

async function sendCricketImage(sock, chatId, asset, caption, message = null) {
  const image = await downloadDriveImage(asset);
  const jpegThumbnail = await downloadOptionalThumbnail(asset);
  await sock.sendMessage(chatId, {
    image,
    caption,
    jpegThumbnail,
    contextInfo: FAKE_FORWARD
  }, message ? { quoted: message } : {});
}

async function sendCricketVideo(sock, chatId, asset, caption, message = null) {
  const video = await downloadDriveVideo(asset);
  const jpegThumbnail = await downloadOptionalThumbnail(asset);
  await sock.sendMessage(chatId, {
    video,
    caption,
    jpegThumbnail,
    contextInfo: FAKE_FORWARD
  }, message ? { quoted: message } : {});
}

async function sendForwardedAudio(sock, chatId, audio, mimetype = 'audio/mpeg', fileName = 'audio.mp3', message = null) {
  await sock.sendMessage(chatId, {
    audio,
    mimetype,
    ptt: false,
    fileName,
    contextInfo: FAKE_FORWARD
  }, message ? { quoted: message } : {});
}

function forwardedContext() {
  return FAKE_FORWARD;
}

module.exports = {
  FAKE_FORWARD,
  forwardedContext,
  getCricketAsset,
  sendCricketImage,
  sendCricketVideo,
  sendForwardedAudio
};
