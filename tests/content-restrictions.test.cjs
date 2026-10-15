'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'axios') return { get: async () => ({ data: { results: [], items: [] } }) };
  if (request === 'cheerio') return { load: () => { throw new Error('offline test did not call cheerio'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const policy = require('../lib/contentRestrictions');

for (const command of [
  'pppv', 'ppxvideos', 'ppxvideo', 'ppxnxx', 'ppxnxxsearch', 'pppornhub', 'ppph',
  'ppredgifs', 'pprgifs', 'ppeporner', 'ppeporn', 'pperome', 'pprome', 'pptnaflix',
  'pptf', 'ppyouporn', 'ppyp', 'ppredtube', 'pprt', 'naddadultsearch',
  'naddadulttrending', 'naddadultvideo', 'naddadultsources', 'nekonsfw', 'nsfwneko',
]) assert.equal(policy.isBlockedAdultCommand(command), true, `${command} must be blocked`);
for (const command of ['rule34search', 'onlyfansdownload', 'e621search', 'nhentaisearch', 'danbooru', 'naddhentai', 'pponlyfans']) {
  assert.equal(policy.isBlockedAdultCommand(command), true, `${command} legacy variant must be blocked`);
}

assert.equal(policy.isBlockedAdultRequest('mdscrape', 'anime --site=xvideos'), true);
assert.equal(policy.isBlockedAdultRequest('mdscrape', 'anime --site=e621'), true);
assert.equal(policy.isBlockedAdultRequest('mdscrape', 'anime --site=onlyfans'), true);
assert.equal(policy.isBlockedAdultRequest('mdscrape', 'anime --site=danbooru'), true);
assert.equal(policy.isBlockedAdultRequest('download', 'https://www.pornhub.com/view_video.php'), true);
assert.equal(policy.isBlockedAdultRequest('neko', 'hentai 3'), true);
assert.equal(policy.isBlockedAdultRequest('neko', 'waifu 3'), false);
assert.equal(policy.isBlockedAdultRequest('ppwebtoon', 'lore olympus'), false);
assert.equal(policy.isBlockedAdultRequest('mdscrape', 'anime --site=zerochan'), false);
assert.equal(policy.isBlockedAdultUrl('https://sub.xnxx.com/video'), true);
assert.equal(policy.isBlockedAdultUrl('https://www.webtoons.com/en/'), false);
assert.equal(policy.isAllowedDirectTarget({ id: 'zerochan', baseUrl: 'https://www.zerochan.net/search?q=' }), true);
assert.equal(policy.isAllowedDirectTarget({ id: 'xvideos', baseUrl: 'https://www.xvideos.com/?k=' }), false);

const neko = require('../plugins/neko');
assert.ok(!neko._internals.TAGS.some(tag => policy.BLOCKED_NEKO_TAGS.has(tag)), 'Neko exposes safe categories only');
assert.equal(require('../lib/nekoSettings').isNsfwEnabled(), false, 'NSFW mode always fails closed');
assert.deepEqual(require('../plugins2/ppsearch'), [], 'adult PP search commands are not registered');
assert.deepEqual(require('../plugins/nekonsfw'), [], 'adult Neko mode command is not registered');
assert.deepEqual(require('../plugins2/pp-testing'), [], 'adult endpoint diagnostics are not registered');
const ppcommon = require('../plugins2/ppcommon');
assert.deepEqual(ppcommon.sites.map(site => site.key), ['webtoons', 'tapas']);
const { MasterDirectScraper: One } = require('../plugins2/direct-scrapers/master-direct-one.cjs');
const { MasterDirectScraper: Two } = require('../plugins2/direct-scrapers/master-direct-two.cjs');
for (const Scraper of [One, Two]) {
  const scraper = new Scraper('/tmp/abix-safe-target-test');
  assert.deepEqual(scraper.targets.map(target => target.id), ['zerochan', 'moegirl', 'anime_pictures', 'seiga_nicovideo']);
}
Module._load = originalLoad;
console.log('[PASS] adult commands blocked, safe Neko categories retained, adult scraper targets removed.');
