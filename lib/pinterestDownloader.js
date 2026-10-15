'use strict';

/**
 * ABIX-AE Pinterest video resolver/downloader.
 *
 * Uses the bot's existing APIFY_TOKEN_1 ... APIFY_TOKEN_N pool.
 * The resolver accepts several common Apify output shapes and the sender
 * validates the returned bytes before handing anything to WhatsApp.
 */

const DEFAULT_ACTOR = 'maximedupre~pinterest-video-downloader';
const APIFY_BASE = 'https://api.apify.com/v2/acts';

function getApifyTokens() {
  const tokens = [];
  const seen = new Set();

  for (let i = 1; i <= 100; i++) {
    for (const key of [`APIFY_TOKEN_${i}`, `APIFY_TOKEN_${String(i).padStart(2, '0')}`]) {
      const value = String(process.env[key] || '').trim();
      if (value && !seen.has(value)) {
        seen.add(value);
        tokens.push({ key, value });
      }
    }
  }

  for (const key of ['APIFY_TOKEN', 'APIFY_API_TOKEN']) {
    const value = String(process.env[key] || '').trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      tokens.push({ key, value });
    }
  }

  return tokens;
}

function isPinterestUrl(value) {
  try {
    const u = new URL(String(value));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com');
  } catch {
    return false;
  }
}

function actorId() {
  return String(process.env.PINTEREST_VIDEO_ACTOR || DEFAULT_ACTOR).trim();
}

function actorEndpoint() {
  return `${APIFY_BASE}/${encodeURIComponent(actorId())}/run-sync-get-dataset-items`;
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function addCandidate(list, url, source) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  const clean = url.trim();
  if (!clean || list.some(x => x.url === clean)) return;
  list.push({ url: clean, source });
}

function collectVideoUrls(item) {
  const candidates = [];

  addCandidate(candidates, item?.bestMediaUrl, 'bestMediaUrl');
  addCandidate(candidates, item?.videoUrl, 'videoUrl');
  addCandidate(candidates, item?.video_url, 'video_url');
  addCandidate(candidates, item?.downloadUrl, 'downloadUrl');
  addCandidate(candidates, item?.download_url, 'download_url');
  addCandidate(candidates, item?.mediaUrl, 'mediaUrl');
  addCandidate(candidates, item?.video?.url, 'video.url');
  addCandidate(candidates, item?.video?.downloadUrl, 'video.downloadUrl');
  addCandidate(candidates, item?.media?.videoUrl, 'media.videoUrl');
  addCandidate(candidates, item?.media?.url, 'media.url');

  for (const v of [
    ...(Array.isArray(item?.mediaVariants) ? item.mediaVariants : []),
    ...(Array.isArray(item?.videos) ? item.videos : []),
    ...(Array.isArray(item?.media?.videos) ? item.media.videos : []),
  ]) {
    if (!v) continue;
    addCandidate(candidates, v.url, 'variant.url');
    addCandidate(candidates, v.videoUrl, 'variant.videoUrl');
    addCandidate(candidates, v.downloadUrl, 'variant.downloadUrl');
  }

  // Prefer explicit video candidates and common media extensions.
  candidates.sort((a, b) => scoreVideoUrl(b.url) - scoreVideoUrl(a.url));
  return candidates;
}

function scoreVideoUrl(url) {
  const lower = String(url).toLowerCase();
  let score = 0;
  if (/\.(mp4|mov|m4v|webm)(?:[?#]|$)/.test(lower)) score += 10;
  if (/\.m3u8(?:[?#]|$)/.test(lower)) score += 7;
  if (/video|mp4|stream|media/.test(lower)) score += 2;
  if (/\.jpg|\.jpeg|\.png|\.webp(?:[?#]|$)/.test(lower)) score -= 20;
  return score;
}

function findVideoItem(items) {
  return items.find(item => {
    if (!item || typeof item !== 'object') return false;
    const type = String(item.mediaType || item.type || '').toLowerCase();
    return type === 'video' || collectVideoUrls(item).length > 0;
  });
}

function shouldRotate(status) {
  return [401, 402, 403, 408, 409, 429, 500, 502, 503, 504].includes(status);
}

async function runPinterestVideoDownloader(url) {
  if (!isPinterestUrl(url)) throw new Error('Invalid Pinterest URL.');

  const tokens = getApifyTokens();
  if (!tokens.length) {
    throw new Error('No Apify tokens found. Add APIFY_TOKEN_1 ... APIFY_TOKEN_N to .env and restart the bot.');
  }

  const errors = [];

  for (let i = 0; i < tokens.length; i++) {
    const { key, value } = tokens[i];

    try {
      const response = await fetch(actorEndpoint() + `?token=${encodeURIComponent(value)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          pinterestTargets: [url],
          maxItems: 1,
          mediaType: 'video',
          rehostMediaToKvStore: true,
        }),
        signal: AbortSignal.timeout(150000),
      });

      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch (_) {}

      if (!response.ok) {
        const detail = payload && typeof payload === 'object' ? JSON.stringify(payload).slice(0, 700) : raw.slice(0, 700);
        const msg = `HTTP ${response.status}: ${detail}`;
        errors.push(`${key}: ${msg}`);
        if (!shouldRotate(response.status)) throw new Error(msg);
        continue;
      }

      const items = extractItems(payload);
      const item = findVideoItem(items);
      if (!item) {
        errors.push(`${key}: Apify returned no video item.`);
        throw new Error('Apify returned no downloadable video for this Pin.');
      }

      const videoCandidates = collectVideoUrls(item);
      if (!videoCandidates.length) {
        throw new Error('Apify returned a Pin but no video URL was exposed.');
      }

      return {
        item,
        videoCandidates,
        videoUrl: videoCandidates[0].url,
        tokenIndex: i + 1,
        tokenName: key,
      };
    } catch (error) {
      const msg = String(error?.message || error);
      errors.push(`${key}: ${msg.slice(0, 600)}`);
      if (/no downloadable video|no video url|invalid pinterest url/i.test(msg)) throw error;
    }
  }

  throw new Error(`All ${tokens.length} Apify token(s) failed.\n${errors.slice(-6).join('\n')}`);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

module.exports = {
  DEFAULT_ACTOR,
  actorId,
  getApifyTokens,
  isPinterestUrl,
  collectVideoUrls,
  runPinterestVideoDownloader,
  formatBytes,
};
