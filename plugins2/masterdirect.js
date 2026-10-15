'use strict';
const { MasterDirectScraper } = require('./direct-scrapers/master-direct-one.cjs');
const { makeDirectScrapeCommand } = require('./direct-scrapers/command-utils.cjs');
module.exports = makeDirectScrapeCommand({
  command: 'masterdirect',
  aliases: ['mdirect', 'mdscrape'],
  label: 'Master Direct Scraper 1',
  service: { Scraper: MasterDirectScraper },
  outputFolder: 'master-direct-one',
});
