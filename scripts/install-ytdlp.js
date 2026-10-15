import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const BIN_DIR = path.join(ROOT, 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');

const RELEASE_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'ABIX-installer'
        }
      },
      async (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();

          try {
            await downloadFile(
              response.headers.location,
              destination
            );

            resolve();
          } catch (error) {
            reject(error);
          }

          return;
        }

        if (response.statusCode !== 200) {
          response.resume();

          reject(
            new Error(
              `HTTP ${response.statusCode}`
            )
          );

          return;
        }

        try {
          await pipeline(
            response,
            fs.createWriteStream(destination)
          );

          resolve();
        } catch (error) {
          reject(error);
        }
      }
    );

    request.on('error', reject);

    request.setTimeout(
      120000,
      () => {
        request.destroy(
          new Error(
            'Download timeout'
          )
        );
      }
    );
  });
}

async function main() {
  fs.mkdirSync(BIN_DIR, {
    recursive: true
  });

  const tempPath =
    `${YTDLP_PATH}.tmp`;

  try {
    console.log(
      '[ABIX] Downloading standalone yt-dlp binary...'
    );

    await downloadFile(
      RELEASE_URL,
      tempPath
    );

    fs.renameSync(
      tempPath,
      YTDLP_PATH
    );

    fs.chmodSync(
      YTDLP_PATH,
      0o755
    );

    const version =
      execFileSync(
        YTDLP_PATH,
        ['--version'],
        {
          encoding: 'utf8'
        }
      ).trim();

    console.log(
      `[ABIX] yt-dlp ready: ${version}`
    );
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}

    console.error(
      '[ABIX] yt-dlp installation failed:',
      error.message
    );
  }
}

main();