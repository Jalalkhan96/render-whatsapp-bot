import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_DOWNLOAD_BYTES = Number(
  process.env.MAX_DOWNLOAD_BYTES || 100 * 1024 * 1024
);

const YTDLP_BIN =
  process.env.YTDLP_BIN || '/home/container/bin/yt-dlp';

const DOWNLOAD_TIMEOUT_MS =
  Number(process.env.YTDLP_TIMEOUT_MS) ||
  10 * 60 * 1000;

/* =====================================================
 * URL VALIDATION
 * ===================================================== */

export function isSupportedUrl(value) {
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();

    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'www.youtu.be' ||
      host === 'pinterest.com' ||
      host === 'www.pinterest.com' ||
      host.endsWith('.pinterest.com') ||
      host === 'pin.it'
    );
  } catch {
    return false;
  }
}

/* =====================================================
 * RUN YT-DLP
 * ===================================================== */

function runYtDlp(args, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;

      finished = true;

      try {
        child.kill('SIGKILL');
      } catch {}

      const error = new Error('YTDLP_TIMEOUT');
      reject(error);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (finished) return;

      finished = true;
      clearTimeout(timer);

      if (error.code === 'ENOENT') {
        reject(new Error('YTDLP_NOT_INSTALLED'));
        return;
      }

      reject(error);
    });

    child.on('close', (code) => {
      if (finished) return;

      finished = true;
      clearTimeout(timer);

      if (code !== 0) {
        const error = new Error(
          stderr.trim() ||
            `yt-dlp exited with code ${code}`
        );

        error.code = 'YTDLP_FAILED';
        error.exitCode = code;
        error.stderr = stderr;
        error.stdout = stdout;

        reject(error);
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

/* =====================================================
 * TEMP DIRECTORY
 * ===================================================== */

async function createTempDirectory(prefix) {
  return fs.mkdtemp(
    path.join(os.tmpdir(), prefix)
  );
}

/* =====================================================
 * FIND DOWNLOADED FILE
 * ===================================================== */

async function findDownloadedFile(directory) {
  const entries = await fs.readdir(
    directory,
    { withFileTypes: true }
  );

  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = path.join(
      directory,
      entry.name
    );

    try {
      const stat = await fs.stat(fullPath);

      if (stat.size > 0) {
        files.push({
          path: fullPath,
          name: entry.name,
          size: stat.size,
        });
      }
    } catch {
      // Ignore files that disappear.
    }
  }

  if (!files.length) {
    return null;
  }

  files.sort(
    (a, b) => b.size - a.size
  );

  return files[0];
}

/* =====================================================
 * MEDIA TYPE
 * ===================================================== */

export function getMediaType(filePath) {
  const ext =
    path.extname(filePath)
      .toLowerCase();

  if (
    [
      '.mp4',
      '.m4v',
      '.mov',
      '.webm',
      '.mkv',
      '.avi',
      '.flv',
    ].includes(ext)
  ) {
    return 'video';
  }

  if (
    [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
    ].includes(ext)
  ) {
    return 'image';
  }

  if (
    [
      '.mp3',
      '.m4a',
      '.aac',
      '.ogg',
      '.opus',
      '.wav',
      '.flac',
    ].includes(ext)
  ) {
    return 'audio';
  }

  return 'document';
}

/* =====================================================
 * GENERIC MEDIA DOWNLOADER
 * ===================================================== */

export async function downloadMedia(
  url,
  options = {}
) {
  if (!isSupportedUrl(url)) {
    throw new Error('UNSUPPORTED_URL');
  }

  const directory =
    await createTempDirectory(
      options.prefix || 'abix-download-'
    );

  const outputTemplate =
    path.join(
      directory,
      'media.%(ext)s'
    );

  try {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',

      '--no-write-info-json',
      '--no-write-thumbnail',
      '--no-write-description',
      '--no-write-comments',

      /*
       * IMPORTANT:
       *
       * Do NOT use:
       *
       *   bv+ba
       *
       * because that requires ffmpeg to merge them.
       *
       * Instead prefer ONE already-merged format.
       */
      '-f',
      options.format ||
        'b[height<=480][ext=mp4]/b[height<=480]/b[ext=mp4]/b',

      '--max-filesize',
      options.maxFileSize || '100M',

      '-o',
      outputTemplate,

      url,
    ];

    await runYtDlp(
      args,
      options.timeoutMs ||
        DOWNLOAD_TIMEOUT_MS
    );

    const downloaded =
      await findDownloadedFile(
        directory
      );

    if (!downloaded) {
      throw new Error(
        'NO_MEDIA_DOWNLOADED'
      );
    }

    if (
      downloaded.size >
      MAX_DOWNLOAD_BYTES
    ) {
      throw new Error(
        'FILE_TOO_LARGE'
      );
    }

    return {
      file: downloaded.path,
      name: downloaded.name,
      size: downloaded.size,
      ext: path.extname(
        downloaded.path
      ).toLowerCase(),
      mediaType: getMediaType(
        downloaded.path
      ),
      directory,

      async cleanup() {
        await fs.rm(
          directory,
          {
            recursive: true,
            force: true,
          }
        );
      },
    };
  } catch (error) {
    await fs.rm(
      directory,
      {
        recursive: true,
        force: true,
      }
    ).catch(() => {});

    throw error;
  }
}

/* =====================================================
 * YOUTUBE
 * ===================================================== */

export async function downloadYouTube(
  url,
  options = {}
) {
  return downloadMedia(
    url,
    {
      ...options,

      prefix: 'abix-youtube-',

      /*
       * Prefer progressive MP4:
       * video + audio already together.
       *
       * This avoids requiring ffmpeg.
       */
      format:
        options.format ||
        'b[height<=480][ext=mp4]/b[height<=480]/b[ext=mp4]/b',

      maxFileSize:
        options.maxFileSize ||
        '100M',
    }
  );
}

/* =====================================================
 * PINTEREST
 * ===================================================== */

export async function downloadPinterest(
  url,
  options = {}
) {
  return downloadMedia(
    url,
    {
      ...options,

      prefix: 'abix-pinterest-',

      /*
       * Pinterest may return image/video formats.
       * Let yt-dlp choose the best single file.
       */
      format:
        options.format ||
        'b',

      maxFileSize:
        options.maxFileSize ||
        '100M',
    }
  );
}

/* =====================================================
 * HELPERS
 * ===================================================== */

export function getMaxDownloadBytes() {
  return MAX_DOWNLOAD_BYTES;
}

export function formatBytes(bytes) {
  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return '0 B';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
  ];

  let value = bytes;
  let index = 0;

  while (
    value >= 1024 &&
    index < units.length - 1
  ) {
    value /= 1024;
    index++;
  }

  return `${value.toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
}