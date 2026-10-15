'use strict';

module.exports = {
  version: '1.0.0',
  userAgent: 'sound-meme-engine/1.0.0 (key-free sound search; contact: local user)',
  defaultLimit: 15,
  defaultTimeoutMs: 25000,
  maxRetries: 2,
  retryBackoffMs: 800,
  cacheTtlSec: 3600,
  cacheDirName: '.sound-cache',
  downloadDirName: 'sounds',
  maxDownloadBytes: 25 * 1024 * 1024,
  sources: ['wikimedia-audio', 'youtube'],
  audioExts: ['.mp3', '.ogg', '.oga', '.wav', '.flac', '.m4a', '.opus'],
};
