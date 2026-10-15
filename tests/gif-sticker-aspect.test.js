'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const shared = read('lib/sticker.js');
const tg = read('plugins2/tgsticker.js');
const neko = read('plugins/nekogif.js');
const stickerCommand = read('plugins2/sticker.js');

// Both shared animated converters must fit proportionally without square padding/cropping.
assert.ok(shared.includes("const fitMode = 'inside'"));
assert.ok(shared.includes("force_original_aspect_ratio=decrease"));
assert.ok(shared.includes("fit: fitMode"));
assert.ok(!shared.includes('pad=480:480'));
assert.ok(!shared.includes('crop=480:480'));
assert.ok(!shared.includes('pad=512:512'));
assert.ok(!shared.includes('pad=320:320'));
assert.ok(/fit:\s*'inside'/.test(stickerCommand));
assert.ok(!stickerCommand.includes("fit:'contain'"));
assert.ok(tg.includes("fit: 'inside'"));
assert.ok(tg.includes('force_original_aspect_ratio=decrease'));
assert.ok(!tg.includes('pad=480:480'));
assert.ok(!tg.includes('crop=480:480'));
assert.ok(!tg.includes('pad=512:512'));
assert.ok(!tg.includes('pad=320:320'));
// Nekogif's MP4 normalization must not crop before the sticker converter sees it.
assert.ok(neko.includes('force_original_aspect_ratio=decrease'));
assert.ok(!neko.includes('crop=480:480'));
console.log('[PASS] animated sticker conversion preserves aspect ratio without crop/padding');


const stickerPlugin = read('plugins2/sticker.js');
const legacyGifSticker = read('plugins2/gif2sticker.js');
const oldGifModes = read('plugins2/gif-modes.js');
const telegram = read('lib/telegramBot.js');
assert.match(stickerPlugin, /command:\s*'sticker'/);
assert.match(stickerPlugin, /aliases:\s*\['s',\s*'st',\s*'stk',\s*'stik'\]/);
assert.ok(stickerPlugin.includes('imageMessage'));
assert.ok(stickerPlugin.includes('videoMessage'));
assert.ok(stickerPlugin.includes("mime === 'image/gif'"));
assert.ok(stickerPlugin.includes('animatedWebpFromBuffer'));
assert.ok(!/command:\s*'s'/.test(legacyGifSticker), 'legacy gif2sticker must not steal -s');
assert.ok(oldGifModes.includes('module.exports = [];'), 'legacy -scc/-sss GIF converters must be disabled');
assert.ok(!/command:\s*'scc'/.test(oldGifModes));
assert.ok(!/command:\s*'sss'/.test(oldGifModes));
assert.ok(telegram.includes("command === 'sticker' || command === 's'"));
assert.ok(telegram.includes("telegramMultipart('sendSticker'"));
assert.ok(telegram.includes('MAX_TELEGRAM_VIDEO_STICKER_BYTES'));
assert.ok(telegram.includes('/sticker, /s'));
console.log('[PASS] -sticker/-s convert replied image/video/GIF; Telegram /sticker and /s are routed; old -scc/-sss conflicts removed');
