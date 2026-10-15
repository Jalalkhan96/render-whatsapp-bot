'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const waSticker = read('plugins2/sticker.js');
const oldGif2Sticker = read('plugins2/gif2sticker.js');
const oldGifModes = read('plugins2/gif-modes.js');
const sharedSticker = read('lib/sticker.js');
const telegram = read('lib/telegramBot.js');

assert.match(waSticker, /command:\s*'sticker'/);
assert.match(waSticker, /aliases:\s*\['s',\s*'st',\s*'stk',\s*'stik'\]/);
for (const required of ['imageMessage', 'videoMessage', 'documentMessage', 'animatedWebpFromBuffer', 'downloadMediaMessage']) {
  assert.ok(waSticker.includes(required), `WhatsApp sticker converter must support ${required}`);
}
assert.ok(waSticker.includes("mime === 'image/gif'"));
assert.ok(waSticker.includes('MAX_INPUT_BYTES'));
assert.ok(!/resize\([^\n]*fit:\s*['"]cover['"]/.test(waSticker), 'sticker image conversion must not crop');

assert.match(oldGif2Sticker, /command:\s*'gif2sticker'/);
assert.ok(!/command:\s*'s'/.test(oldGif2Sticker), 'old GIF-only command must not take the -s shortcut');
assert.ok(oldGifModes.includes('module.exports = [];'), 'legacy GIF modes should be disabled');
assert.ok(!/command:\s*'(?:s|scc|sss)'/.test(oldGifModes));

assert.ok(sharedSticker.includes("const fitMode = 'inside'"));
assert.ok(sharedSticker.includes('force_original_aspect_ratio=decrease'));
assert.ok(sharedSticker.includes('maxBytes'));
assert.ok(sharedSticker.includes('500 * 1024'));
assert.ok(!sharedSticker.includes('pad=480:480'));
assert.ok(!sharedSticker.includes('crop=480:480'));

for (const required of [
  "command === 'sticker' || command === 's'",
  "telegramMultipart('sendSticker'",
  'MAX_TELEGRAM_VIDEO_STICKER_BYTES',
  "'-c:v', 'libvpx-vp9'",
  '/sticker, /s',
]) {
  assert.ok(telegram.includes(required), `Telegram sticker implementation missing ${required}`);
}

console.log('[PASS] WhatsApp -sticker/-s and Telegram /sticker-/s are registered; media conversions and old command conflicts checked');
