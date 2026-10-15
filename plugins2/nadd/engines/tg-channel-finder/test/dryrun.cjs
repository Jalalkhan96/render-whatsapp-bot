// Offline fixture tests for t.me page parsing (no network).
const assert = require('assert');
const { parseChannelPage, nextBefore, stripTags } = require('../lib/scrape.cjs');
const { normChannel } = require('../lib/store.cjs');
const { searchIndex } = require('../lib/index.cjs');

const FIXTURE = `
<div class="tgme_widget_message_wrap js-widget_message_wrap" data-post="mychannel/101">
  <div class="tgme_widget_message text_not_supported_wrap">
    <div class="tgme_widget_message_text js-message_text" dir="auto">Hello <b>world</b>, crypto signals here!<br>Join now</div>
    <div class="tgme_widget_message_footer"><time datetime="2026-10-01T10:00:00+00:00"></time></div>
  </div>
</div>
<div class="tgme_widget_message_wrap js-widget_message_wrap" data-post="mychannel/102">
  <div class="tgme_widget_message text_not_supported_wrap">
    <div class="tgme_widget_message_footer"><time datetime="2026-10-02T10:00:00+00:00"></time></div>
  </div>
</div>
<div class="tgme_widget_message" data-before="99"></div>`;

const msgs = parseChannelPage(FIXTURE, 'mychannel');
assert.strictEqual(msgs.length, 2, 'expected 2 messages');
assert.strictEqual(msgs[0].link, 'https://t.me/mychannel/101');
assert.ok(msgs[0].text.includes('Hello world, crypto signals here!'), 'tags stripped, text kept: ' + msgs[0].text);
assert.ok(msgs[0].text.includes('\n'), 'br should become newline');
assert.strictEqual(msgs[0].date, '2026-10-01');
assert.strictEqual(msgs[1].text, '', 'media-only message -> empty text');
console.log('ok: parseChannelPage');

assert.strictEqual(nextBefore(FIXTURE), '99');
assert.strictEqual(nextBefore('<div></div>'), null);
console.log('ok: nextBefore pagination');

assert.strictEqual(stripTags('<b>x</b><br>y'), 'x\ny');
console.log('ok: stripTags');

assert.strictEqual(normChannel('@CryptoSignals'), 'cryptosignals');
assert.strictEqual(normChannel('https://t.me/s/durov?before=5'), 'durov');
assert.strictEqual(normChannel('  Jobs '), 'jobs');
console.log('ok: normChannel');

// index search: AND semantics + ranking by hit count
const idx = { version: 1, channels: {
  movies: { posts: [
    { postId: 'movies/3', msgId: '3', link: 'https://t.me/movies/3', text: 'Avengers Endgame 2019 1080p BluRay', date: '2026-09-01' },
    { postId: 'movies/2', msgId: '2', link: 'https://t.me/movies/2', text: 'Avengers Endgame trailer', date: '2026-08-01' },
    { postId: 'movies/1', msgId: '1', link: 'https://t.me/movies/1', text: 'Random comedy show', date: '2026-07-01' },
  ]},
  jobs: { posts: [
    { postId: 'jobs/9', msgId: '9', link: 'https://t.me/jobs/9', text: 'Hiring: avengers costume designer', date: '2026-09-02' },
  ]},
}};
let hits = searchIndex(idx, 'avengers endgame');
assert.strictEqual(hits.length, 2, 'AND: both terms required, got ' + hits.length);
assert.strictEqual(hits[0].postId, 'movies/3', 'more hits + newer should rank first');
hits = searchIndex(idx, 'avengers');
assert.strictEqual(hits.length, 3, 'single term across channels');
hits = searchIndex(idx, 'nonexistent xyz');
assert.strictEqual(hits.length, 0);
hits = searchIndex(idx, 'a');
assert.strictEqual(hits.length, 0, 'single-char terms ignored');
console.log('ok: searchIndex ranking + AND semantics');

console.log('\nAll tg-finder tests passed.');
