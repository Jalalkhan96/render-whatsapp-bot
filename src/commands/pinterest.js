import fs from 'node:fs/promises';

import {
  downloadPinterest,
  formatBytes,
} from '../services/ytdlp.js';

/**
 * Check whether a URL is Pinterest.
 */
function isPinterestUrl(value) {
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();

    return (
      host === 'pin.it' ||
      host === 'pinterest.com' ||
      host === 'www.pinterest.com' ||
      host.endsWith('.pinterest.com')
    );
  } catch {
    return false;
  }
}

/**
 * Get a safe filename for WhatsApp.
 */
function sanitizeFileName(name) {
  return String(name || 'pinterest-media')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'pinterest-media';
}

/**
 * MIME type based on extension.
 */
function getMimeType(ext) {
  switch (String(ext || '').toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';

    case '.png':
      return 'image/png';

    case '.webp':
      return 'image/webp';

    case '.gif':
      return 'image/gif';

    case '.mp4':
      return 'video/mp4';

    case '.webm':
      return 'video/webm';

    case '.mkv':
      return 'video/x-matroska';

    case '.mov':
      return 'video/quicktime';

    case '.mp3':
      return 'audio/mpeg';

    case '.m4a':
      return 'audio/mp4';

    case '.ogg':
      return 'audio/ogg';

    case '.opus':
      return 'audio/ogg';

    default:
      return 'application/octet-stream';
  }
}

/**
 * Send Pinterest media using Baileys.
 */
export async function pinterestCommand({
  sock,
  chatJid,
  args = [],
}) {
  const input = args.join(' ').trim();

  if (!input) {
    await sock.sendMessage(chatJid, {
      text:
        '📌 *Pinterest Downloader*\n\n' +
        'Usage:\n' +
        '/pin <Pinterest URL>\n\n' +
        'Example:\n' +
        '/pin https://pin.it/xxxxx',
    });

    return true;
  }

  if (!isPinterestUrl(input)) {
    await sock.sendMessage(chatJid, {
      text:
        '❌ Invalid Pinterest URL.\n\n' +
        'Supported links:\n' +
        '• https://pin.it/...\n' +
        '• https://pinterest.com/...\n' +
        '• https://www.pinterest.com/...',
    });

    return true;
  }

  let result = null;

  try {
    await sock.sendMessage(chatJid, {
      text: '📌 Pinterest download started...\n⏳ Please wait.',
    });

    result = await downloadPinterest(input, {
      timeoutMs: 10 * 60 * 1000,
      maxFileSize: '100M',
    });

    if (!result?.file) {
      throw new Error('NO_MEDIA_DOWNLOADED');
    }

    const buffer = await fs.readFile(result.file);

    if (!buffer.length) {
      throw new Error('EMPTY_FILE');
    }

    const sizeText = formatBytes(result.size);

    console.log(
      `Pinterest download complete: ${result.name} (${sizeText})`
    );

    // -------------------------------------------------
    // IMAGE
    // -------------------------------------------------

    if (result.mediaType === 'image') {
      await sock.sendMessage(chatJid, {
        image: buffer,
        mimetype: getMimeType(result.ext),
        caption:
          `📌 *Pinterest*\n` +
          `📦 ${sizeText}`,
      });

      return true;
    }

    // -------------------------------------------------
    // VIDEO
    // -------------------------------------------------

    if (result.mediaType === 'video') {
      try {
        await sock.sendMessage(chatJid, {
          video: buffer,
          mimetype: getMimeType(result.ext),
          caption:
            `📌 *Pinterest Video*\n` +
            `📦 ${sizeText}`,
        });

        return true;
      } catch (videoError) {
        console.warn(
          'Pinterest video send failed, trying document:',
          videoError?.message || videoError
        );
      }
    }

    // -------------------------------------------------
    // AUDIO
    // -------------------------------------------------

    if (result.mediaType === 'audio') {
      await sock.sendMessage(chatJid, {
        audio: buffer,
        mimetype: getMimeType(result.ext),
        ptt: false,
      });

      return true;
    }

    // -------------------------------------------------
    // DOCUMENT FALLBACK
    // -------------------------------------------------

    await sock.sendMessage(chatJid, {
      document: buffer,
      mimetype: getMimeType(result.ext),
      fileName: sanitizeFileName(
        result.name || `pinterest${result.ext || '.bin'}`
      ),
      caption:
        `📎 *Pinterest Media*\n` +
        `📦 ${sizeText}`,
    });

    return true;
  } catch (error) {
    console.error('Pinterest command error:', error);

    let message =
      '❌ Failed to download Pinterest media.\n' +
      'The Pin may be unavailable, private, deleted, or unsupported.';

    switch (error?.message) {
      case 'UNSUPPORTED_URL':
        message = '❌ Unsupported Pinterest URL.';
        break;

      case 'YTDLP_NOT_INSTALLED':
        message =
          '❌ yt-dlp is not installed on the server.';
        break;

      case 'YTDLP_TIMEOUT':
        message =
          '⏳ Pinterest download timed out. Please try again.';
        break;

      case 'FILE_TOO_LARGE':
        message =
          '❌ The downloaded file is larger than the 100 MB limit.';
        break;

      case 'NO_MEDIA_DOWNLOADED':
        message =
          '❌ No downloadable media was found in this Pin.';
        break;

      case 'EMPTY_FILE':
        message =
          '❌ The downloaded file is empty.';
        break;

      case 'YTDLP_FAILED':
        message =
          '❌ yt-dlp could not download this Pinterest Pin.';
        break;

      default:
        break;
    }

    await sock.sendMessage(chatJid, {
      text: message,
    });

    return true;
  } finally {
    // Always remove temporary files.
    if (result?.cleanup) {
      try {
        await result.cleanup();
      } catch (cleanupError) {
        console.error(
          'Pinterest cleanup error:',
          cleanupError
        );
      }
    }
  }
}

/**
 * Export aliases so the router can use either name.
 */
export const pinCommand = pinterestCommand;
export const pinterestDownloadCommand = pinterestCommand;