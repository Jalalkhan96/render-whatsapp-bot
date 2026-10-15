'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseOptions } = require('../plugins2/direct-scrapers/command-utils.cjs');

// The scrapers only need cheerio for real HTTP scraping. Stub it for this
// focused pipeline regression test so no network/dependency installation runs.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'cheerio') return { load() { throw new Error('cheerio is not used in this test'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const { MasterDirectScraper: ScraperOne } = require('../plugins2/direct-scrapers/master-direct-one.cjs');
const { MasterDirectScraper: ScraperTwo } = require('../plugins2/direct-scrapers/master-direct-two.cjs');
Module._load = originalLoad;

(async () => {
  const parsed = parseOptions(['anime', '--site=zerochan'], 4);
  assert.equal(parsed.query, 'anime');
  assert.equal(parsed.site, 'zerochan', 'safe source selection should remain available');
  assert.throws(() => parseOptions(['anime', '--site=xvideos'], 4), /Adult-content sources are disabled/i, 'adult targets must be blocked');

  for (const [label, Scraper] of [['one', ScraperOne], ['two', ScraperTwo]]) {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), `mdscrape-${label}-`));
    try {
      const scraper = new Scraper(outputDir);
      let called = [];
      scraper.scrapeTarget = async (target, query, limit) => {
        called.push({ id: target.id, query, limit });
        return [{ platform: target.id, title: query, url: `https://example.test/${target.id}` }];
      };
      const results = await scraper.runPipeline(parsed.query, {
        targetId: parsed.site,
        maxTargets: parsed.maxTargets,
        perSiteLimit: parsed.perSiteLimit,
        delayMs: 0,
      });
      assert.equal(called.length, 1, `${label}: specific site should call scraper once`);
      assert.equal(called[0].id, 'zerochan', `${label}: should select the safe source`);
      assert.equal(results.length, 1, `${label}: should return mocked result`);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }
  console.log('PASS: safe target selection works and adult site selectors are blocked in both scrapers.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
