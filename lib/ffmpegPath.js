'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

let cached = undefined;

function isExecutable(filePath) {
  try {
    if (!filePath || filePath === 'ffmpeg') return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function probeSystemFfmpeg() {
  try {
    const probe = spawnSync('ffmpeg', ['-version'], {
      stdio: 'ignore',
      shell: false,
      timeout: 3000,
    });
    return !probe.error && probe.status === 0 ? 'ffmpeg' : null;
  } catch {
    return null;
  }
}

function getFfmpegPath() {
  if (cached !== undefined) return cached;

  const configured = String(process.env.FFMPEG_PATH || '').trim();
  if (isExecutable(configured)) return (cached = configured);

  for (const candidate of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (isExecutable(candidate)) return (cached = candidate);
  }

  return (cached = probeSystemFfmpeg());
}

function requireFfmpegPath() {
  const binary = getFfmpegPath();
  if (!binary) {
    throw new Error('FFmpeg is unavailable. Install ffmpeg on the host or set FFMPEG_PATH to an executable binary.');
  }
  return binary;
}

function clearFfmpegPathCache() {
  cached = undefined;
}

module.exports = { getFfmpegPath, requireFfmpegPath, clearFfmpegPathCache };
