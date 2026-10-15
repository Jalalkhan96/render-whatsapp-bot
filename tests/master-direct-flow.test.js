'use strict';

// Offline integration smoke test: mocks the network and UI transport, but
// exercises the real command wrapper, result session, button ID, and download.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ownerPath = require.resolve(path.join(root, 'lib/owner.js'));
const settingsPath = require.resolve(path.join(root, 'settings.js'));
const interactivePath = require.resolve(path.join(root, 'lib/interactiveMenu.js'));
require.cache[ownerPath] = { id: ownerPath, filename: ownerPath, loaded: true, exports: { resolveOwner: async () => ({ isOwner: true }) } };
require.cache[settingsPath] = { id: settingsPath, filename: settingsPath, loaded: true, exports: { prefixes: ['-'] } };

let sentUi;
require.cache[interactivePath] = {
  id: interactivePath,
  filename: interactivePath,
  loaded: true,
  exports: {
    sendInteractiveCarousel: async (_sock, _jid, payload) => { sentUi = { mode: 'carousel', payload }; return { key: { id: 'slider' } }; },
    sendInteractiveMessage: async (_sock, _jid, payload) => { sentUi = { mode: 'single', payload }; return { key: { id: 'single' } }; },
  },
};

const { makeDirectScrapeCommand } = require('../plugins2/direct-scrapers/command-utils.cjs');
class FakeScraper {
  constructor() { this.outputDir = path.join(root, 'data', 'test-temp-media'); this.targets = [{ id: 'zerochan', name: 'Zerochan', baseUrl: 'https://www.zerochan.net/search?q=', type: 'image_gallery' }]; }
  getTargetCount() { return this.targets.length; }
  async runPipeline() {
    return [{ platform: 'testsite', category: 'mainstream', title: 'Test video', url: 'https://media.example/test_240p.mp4', thumbnailUrl: 'https://media.example/test.jpg', mediaOptions: [{ quality: '240p', label: '240P', url: 'https://media.example/test_240p.mp4' }] }];
  }
}

const plugin = makeDirectScrapeCommand({
  command: 'masterdirect', aliases: ['mdirect', 'mdscrape'], label: 'Test Scraper',
  service: { Scraper: FakeScraper }, outputFolder: 'test-temp-media',
});
const sent = [];
const sock = {
  sendMessage: async (_jid, content) => {
    sent.push(content);
    return content?.delete ? {} : { key: { id: 'status' } };
  },
};
global.fetch = async rawUrl => {
  const url = String(rawUrl);
  if (url.includes('test.jpg')) return new Response(Buffer.from('fake-image-bytes'), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (url.includes('test_240p.mp4')) return new Response(Buffer.from('fake-video-bytes'), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '16' } });
  return new Response('<html><script>html5player.setVideoUrl240(\'https://media.example/test_240p.mp4\')</script></html>', { status: 200, headers: { 'content-type': 'text/html' } });
};
const jid = '923000000000@s.whatsapp.net';
const message = { key: { remoteJid: jid, participant: jid }, message: { conversation: '-mdscrape test wallpaper' } };

(async () => {
  await plugin.handler(sock, message, ['test video'], { chatId: jid, senderId: jid, prefix: '-' });
  assert.equal(sentUi.mode, 'single', 'one result should use a single media card with a direct button');
  const download = sentUi.payload.buttons.find(item => JSON.parse(item.buttonParamsJson).display_text.includes('DOWNLOAD'));
  assert.ok(download, 'the card has a low-quality DOWNLOAD button');
  assert.match(JSON.parse(download.buttonParamsJson).display_text, /240P|LOW/i, 'download button must be a low quality option');
  const actionId = JSON.parse(download.buttonParamsJson).id;
  const parts = actionId.replace(/^-/, '').split(/\s+/);
  assert.equal(parts[0], 'mdscrape', 'the button uses the scraper command alias');
  assert.equal(parts[1], '__download');

  await plugin.handler(sock, message, parts.slice(1), { chatId: jid, senderId: jid, prefix: '-' });
  const attachment = sent.find(item => item && item.document && item.fileName);
  assert.ok(attachment, 'tapping DOWNLOAD sends the selected file as a document');
  assert.equal(attachment.mimetype, 'video/mp4');
  assert.equal(attachment._skipForwardContext, true, 'the file send explicitly disables fake-forward metadata');

  await plugin.handler(sock, message, ['--list-sites'], { chatId: jid, senderId: jid, prefix: '-' });
  assert.ok(sent.some(item => String(item?.text || '').includes('SUPPORTED SITES') && String(item?.text || '').includes('zerochan — Zerochan')), 'the command should list configured site IDs and names');

  require('node:fs').rmSync(path.join(root, 'data', 'test-temp-media'), { recursive: true, force: true });
  console.log('[PASS] mocked end-to-end one-video card -> 240p DOWNLOAD button -> document send');
})().catch(error => {
  try { require('node:fs').rmSync(path.join(root, 'data', 'test-temp-media'), { recursive: true, force: true }); } catch {}
  console.error(error);
  process.exitCode = 1;
});
