'use strict';

/**
 * config.cjs — engine-wide defaults. Everything overridable per call.
 */
module.exports = {
  version: '1.0.0',
  userAgent: 'meme-search-engine/1.0.0 (key-free meme search; contact: local user)',
  defaultLimit: 20,
  defaultTimeoutMs: 20000,
  maxRetries: 2,
  retryBackoffMs: 800,
  cacheTtlSec: 3600, // 1h disk cache for search responses
  cacheDirName: '.meme-cache',
  downloadDirName: 'downloads',
  maxDownloadBytes: 25 * 1024 * 1024, // 25 MB per image
  sources: ['imgflip', 'memeapi', 'wikimedia'],
  imageExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  // crude NSFW gate for title-based sources (meme-api flags nsfw itself too)
  nsfwTerms: ['nsfw', 'porn', 'hentai', 'xxx', 'nude', 'naked', 'lewd', 'rule34'],
};
