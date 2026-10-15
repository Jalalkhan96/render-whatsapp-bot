'use strict';
const { MasterDirectScraper } = require('./direct-scrapers/master-direct-two.cjs');
const { makeDirectScrapeCommand } = require('./direct-scrapers/command-utils.cjs');
module.exports = makeDirectScrapeCommand({
  command: 'masterdirect2',
  aliases: ['mdirect2', 'mdscrape2'],
  label: 'Master Direct Scraper 2',
  service: { Scraper: MasterDirectScraper },
  outputFolder: 'master-direct-two',
});
