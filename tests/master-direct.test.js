'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseOptions, publicHttpUrl, typeFromUrl } = require('../plugins2/direct-scrapers/command-utils.cjs');

const full = parseOptions(['anime', 'wallpaper', '--all', '--per-site=1'], 74);
assert.deepStrictEqual(full, {
  query: 'anime wallpaper',
  maxTargets: 74,
  perSiteLimit: 1,
  all: true,
  site: '',
  listSites: false,
});

const limited = parseOptions(['cats', '--sites=4', '--per-site=3'], 20);
assert.deepStrictEqual(limited, {
  query: 'cats',
  maxTargets: 4,
  perSiteLimit: 3,
  all: false,
  site: '',
  listSites: false,
});

for (const [file, command] of [
  ['../plugins2/masterdirect.js', "command: 'masterdirect'"],
  ['../plugins2/masterdirect2.js', "command: 'masterdirect2'"],
]) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert(source.includes(command), `${file} must expose its separate command name`);
  assert(source.includes('makeDirectScrapeCommand'), `${file} must use the shared protected command wrapper`);
}

const utilitySource = fs.readFileSync(path.join(__dirname, '../plugins2/direct-scrapers/command-utils.cjs'), 'utf8');
assert(utilitySource.includes('ownerOnly: true'), 'shared command wrapper must require configured owners');
assert(utilitySource.includes('resolveOwner'), 'shared command wrapper must explicitly resolve primary/secondary owner identity');

const stickerSource = fs.readFileSync(path.join(__dirname, '../lib/sticker.js'), 'utf8');
assert(stickerSource.includes("const fitMode = options.fit === 'contain' ? 'contain' : 'cover'"));
assert(stickerSource.includes('crop=480:480'));
console.log('[PASS] master-direct command configuration, site options, and sticker crop defaults');


assert.strictEqual(publicHttpUrl('https://images.example.com/file.jpg'), 'https://images.example.com/file.jpg');
assert.strictEqual(publicHttpUrl('file:///etc/passwd'), null);
assert.strictEqual(publicHttpUrl('', 'https://example.com/page'), null);
assert.strictEqual(publicHttpUrl('http://127.0.0.1/admin'), null);
assert.strictEqual(publicHttpUrl('http://192.168.1.10/image.jpg'), null);
assert.strictEqual(typeFromUrl('https://cdn.example/video.mp4?token=123'), 'video');
assert.strictEqual(typeFromUrl('https://cdn.example/wallpaper.png'), 'image');
assert.strictEqual(typeFromUrl('https://example.com/watch/abc'), '');
assert(utilitySource.includes('⬇️ DOWNLOAD'), 'video card must expose low-quality Download buttons');
assert(utilitySource.includes('➡️ MORE VIDEO'), 'video card must paginate to one next video');
assert(utilitySource.includes('--list-sites'), 'commands must list all configured site IDs and names');
assert(utilitySource.includes("sendInteractiveMessage(sock, chatId"), 'one-video media search must use the bot interactive message transport');
assert(utilitySource.includes('_skipForwardContext: true'), 'plain sends must opt out of fake-forward metadata');
assert(utilitySource.includes("document: buffer"), 'download action must send a downloadable attachment');
assert(!utilitySource.includes('isForwarded: true'), 'media flow must not add fake-forward metadata');
console.log('[PASS] Master Direct one-video/low-quality download routing, URL safety, and no-fake-forward markers');
