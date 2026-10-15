'use strict';

const assert = require('assert');
const engine = require('../plugins2/scrape/engines/pinterest/index.cjs');
const service = require('../lib/pinterestSearchService.cjs');

const pinImage = 'https://i.pinimg.com/originals/aa/bb/cc/test-image.jpg';
const pinVideo = 'https://v.pinimg.com/videos/mc/720p/ab/cd/ef/test-video.mp4';
const fixture = {
  resource_response: {
    data: [{
      id: '12345',
      grid_title: 'Test Pinterest media',
      images: { orig: { url: pinImage, width: 1200, height: 1600 } },
      videos: { video_list: { V_720P: { url: pinVideo, width: 720, height: 1280, duration: 8000 } } },
    }],
  },
};

const html = `<html><head><meta property="og:image" content="${pinImage}"></head><body><script id="__PWS_DATA__" type="application/json">${JSON.stringify(fixture)}</script></body></html>`;
const results = engine.extractMediaFromHtml(html, 10);
assert(results.some((item) => item.type === 'image' && item.url === pinImage), 'extracts Pinterest image URLs from embedded resource JSON');
assert(results.some((item) => item.type === 'video' && item.url === pinVideo), 'extracts Pinterest MP4 URLs from embedded resource JSON');
assert.strictEqual(new Set(results.map((item) => item.url)).size, results.length, 'deduplicates media URLs');
assert.strictEqual(engine.mediaType(pinVideo), 'video', 'identifies direct MP4 video URLs');
assert(engine.validPinterestPage('https://www.pinterest.com/pin/12345/'), 'accepts public Pinterest pages');
assert.strictEqual(engine.normalizeMedia('https://example.com/not-pinterest.jpg'), null, 'rejects media outside pinimg.com');

const apify = service.normalizeApify([{ title: 'Actor result', videos: { video_list: { V_720P: { url: pinVideo } } }, images: { orig: { url: pinImage } } }], 10);
assert(apify.some((item) => item.type === 'video' && item.url === pinVideo), 'normalizes Apify video output');
assert(apify.some((item) => item.type === 'image' && item.url === pinImage), 'normalizes Apify image output');

(async () => {
  const directVideoUrl = await service.search(pinVideo, { limit: 1 });
  assert.strictEqual(directVideoUrl.items[0].type, 'video', 'accepts a direct Pinterest CDN video URL without parsing it as HTML');
  assert.strictEqual(directVideoUrl.items[0].url, pinVideo);
  console.log('[PASS] Pinterest JSON/XHR parser, media classification, deduplication, CDN URL mode, and Apify normalization');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
