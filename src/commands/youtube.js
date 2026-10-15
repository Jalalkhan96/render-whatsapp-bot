import fs from 'node:fs/promises';

import {
  downloadYouTube,
  formatBytes,
} from '../services/ytdlp.js';

import {
  searchYouTube,
  formatYouTubeResults,
  extractYouTubeUrl,
} from '../services/youtubeSearch.js';

// -----------------------------------------------------
// Pending YouTube searches
// -----------------------------------------------------
//
// chatJid -> {
//   results: [...],
//   query: '...',
//   createdAt: number
// }
//
// Only one pending search is kept per chat.
// It automatically expires after 5 minutes.
//
const pendingSearches = new Map();

const SEARCH_STATE_TTL_MS = 5 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = Number(
  process.env.MAX_DOWNLOAD_BYTES || 100 * 1024 * 1024
);

/**
 * Remove expired YouTube search states.
 */
function cleanupExpiredSearches() {
  const now = Date.now();

  for (const [chatJid, state] of pendingSearches.entries()) {
    if (!state?.createdAt || now - state.createdAt > SEARCH_STATE_TTL_MS) {
      pendingSearches.delete(chatJid);
    }
  }
}

// Run cleanup periodically.
const cleanupTimer = setInterval(
  cleanupExpiredSearches,
  60 * 1000
);

// Do not keep Node alive just because of this timer.
cleanupTimer.unref?.();

/**
 * Check whether text is exactly 1-5.
 */
export function isYouTubeSelection(text) {
  return /^[1-5]$/.test(String(text || '').trim());
}

/**
 * Check whether this chat currently has a valid YouTube search.
 */
export function hasPendingYouTubeSearch(chatJid) {
  cleanupExpiredSearches();

  const state = pendingSearches.get(chatJid);

  if (!state) {
    return false;
  }

  return (
    Date.now() - state.createdAt <= SEARCH_STATE_TTL_MS
  );
}

/**
 * Process a number selection such as 1, 2, 3, 4, 5.
 */
export async function handleYouTubeSelection({
  sock,
  chatJid,
  text,
}) {
  cleanupExpiredSearches();

  const choice = String(text || '').trim();

  if (!isYouTubeSelection(choice)) {
    return false;
  }

  const state = pendingSearches.get(chatJid);

  if (!state) {
    return false;
  }

  if (Date.now() - state.createdAt > SEARCH_STATE_TTL_MS) {
    pendingSearches.delete(chatJid);

    await sock.sendMessage(chatJid, {
      text:
        '⌛ Your YouTube search has expired.\n\n' +
        'Please search again using:\n' +
        '/yt your search',
    });

    return true;
  }

  const index = Number(choice) - 1;
  const selected = state.results?.[index];

  if (!selected?.url) {
    await sock.sendMessage(chatJid, {
      text: '❌ That YouTube selection is no longer available.',
    });

    return true;
  }

  // Delete state before downloading so a second message
  // cannot trigger the same download again.
  pendingSearches.delete(chatJid);

  await downloadAndSendYouTube({
    sock,
    chatJid,
    url: selected.url,
    title: selected.title,
    choice,
  });

  return true;
}

/**
 * Search YouTube and save the top results for this chat.
 */
export async function youtubeSearchCommand({
  sock,
  chatJid,
  args = [],
}) {
  const query = args.join(' ').trim();

  if (!query) {
    await sock.sendMessage(chatJid, {
      text:
        '🎬 *YouTube Search*\n\n' +
        'Usage:\n' +
        '/yt pashto songs\n\n' +
        'or:\n' +
        '$yt pashto songs',
    });

    return true;
  }

  // Direct YouTube URL can be downloaded without searching.
  const directUrl = extractYouTubeUrl(query);

  if (directUrl) {
    await downloadAndSendYouTube({
      sock,
      chatJid,
      url: directUrl,
      title: 'YouTube video',
      choice: null,
    });

    return true;
  }

  await sock.sendMessage(chatJid, {
    text: `🔎 Searching YouTube for:\n*${query}*`,
  });

  try {
    const results = await searchYouTube(query, {
      maxResults: 5,
    });

    if (!results.length) {
      await sock.sendMessage(chatJid, {
        text: `❌ No YouTube results found for:\n*${query}*`,
      });

      return true;
    }

    pendingSearches.set(chatJid, {
      query,
      results,
      createdAt: Date.now(),
    });

    await sock.sendMessage(chatJid, {
      text: formatYouTubeResults(query, results),
    });

    return true;
  } catch (error) {
    console.error('YouTube search command error:', error);

    let text = '❌ YouTube search failed.';

    if (error?.message === 'YOUTUBE_SEARCH_TIMEOUT') {
      text = '⏳ YouTube search timed out. Please try again.';
    }

    await sock.sendMessage(chatJid, {
      text,
    });

    return true;
  }
}

/**
 * Download a selected/direct YouTube video and send it.
 */
async function downloadAndSendYouTube({
  sock,
  chatJid,
  url,
  title,
  choice,
}) {
  let result = null;

  try {
    const selectedText = choice
      ? `Selected result *${choice}*`
      : 'Direct YouTube link';

    await sock.sendMessage(chatJid, {
      text:
        `📥 ${selectedText}\n` +
        `🎬 ${title || 'YouTube video'}\n\n` +
        `Downloading in normal quality... ⏳`,
    });

    result = await downloadYouTube(url, {
      maxHeight: 480,
      maxFileSize: '100M',
      timeoutMs: 10 * 60 * 1000,
    });

    if (!result?.file) {
      throw new Error('NO_MEDIA_DOWNLOADED');
    }

    if (result.size > MAX_DOWNLOAD_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }

    const buffer = await fs.readFile(result.file);

    if (!buffer.length) {
      throw new Error('EMPTY_FILE');
    }

    const sizeText = formatBytes(result.size);

    console.log(
      `YouTube download complete: ${result.name} (${sizeText})`
    );

    // -------------------------------------------------
    // Video
    // -------------------------------------------------
    if (result.mediaType === 'video') {
      try {
        await sock.sendMessage(chatJid, {
          video: buffer,
          mimetype: getVideoMimeType(result.ext),
          caption:
            `🎬 ${title || 'YouTube video'}\n` +
            `📦 ${sizeText}`,
        });

        return;
      } catch (videoError) {
        console.warn(
          'WhatsApp video send failed, trying document:',
          videoError?.message || videoError
        );

        // Fall through to document fallback.
      }
    }

    // -------------------------------------------------
    // Document fallback
    // -------------------------------------------------
    await sock.sendMessage(chatJid, {
      document: buffer,
      mimetype: getMimeType(result.ext),
      fileName: sanitizeFileName(
        `${title || 'youtube-video'}${result.ext || '.mp4'}`
      ),
      caption:
        `📎 ${title || 'YouTube media'}\n` +
        `📦 ${sizeText}`,
    });
  } catch (error) {
    console.error('YouTube download command error:', error);

    let message =
      '❌ Failed to download the YouTube video.\n' +
      'The video may be unavailable, restricted, or unsupported.';

    switch (error?.message) {
      case 'YTDLP_NOT_INSTALLED':
        message =
          '❌ yt-dlp is not installed on the server.';
        break;

      case 'YTDLP_TIMEOUT':
        message =
          '⏳ Download timed out. Please try a shorter video.';
        break;

      case 'FILE_TOO_LARGE':
        message =
          '❌ The downloaded file is larger than the 100 MB limit.';
        break;

      case 'NO_MEDIA_DOWNLOADED':
        message =
          '❌ yt-dlp could not find downloadable media.';
        break;

      case 'EMPTY_FILE':
        message =
          '❌ The downloaded file is empty.';
        break;

      case 'YTDLP_FAILED':
        message =
          '❌ YouTube download failed. The video may require special access or may no longer be available.';
        break;

      default:
        break;
    }

    await sock.sendMessage(chatJid, {
      text: message,
    });
  } finally {
    // Always delete the temporary download.
    if (result?.cleanup) {
      try {
        await result.cleanup();
      } catch (cleanupError) {
        console.error(
          'Failed to clean YouTube temporary files:',
          cleanupError
        );
      }
    }
  }
}

/**
 * Get video MIME type.
 */
function getVideoMimeType(ext) {
  switch (String(ext || '').toLowerCase()) {
    case '.webm':
      return 'video/webm';

    case '.mkv':
      return 'video/x-matroska';

    case '.mov':
      return 'video/quicktime';

    case '.m4v':
      return 'video/x-m4v';

    default:
      return 'video/mp4';
  }
}

/**
 * Get a reasonable MIME type for documents.
 */
function getMimeType(ext) {
  switch (String(ext || '').toLowerCase()) {
    case '.mp4':
      return 'video/mp4';

    case '.webm':
      return 'video/webm';

    case '.mkv':
      return 'video/x-matroska';

    case '.mov':
      return 'video/quicktime';

    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';

    case '.png':
      return 'image/png';

    case '.webp':
      return 'image/webp';

    case '.gif':
      return 'image/gif';

    default:
      return 'application/octet-stream';
  }
}

/**
 * Make a safe WhatsApp filename.
 */
function sanitizeFileName(name) {
  return String(name || 'youtube-media')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'youtube-media';
}