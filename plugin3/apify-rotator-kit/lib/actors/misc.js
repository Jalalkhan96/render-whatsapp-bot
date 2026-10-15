const { apifyRunSync } = require("../apifyClient");
const ACTORS = require("./registry");

function scrapeReddit(input, opts) {
  return apifyRunSync(ACTORS.reddit.scraper, input, { label: "reddit:scrape", ...opts });
}

function scrapePinterest(input, opts) {
  return apifyRunSync(ACTORS.pinterest.scraper, input, { label: "pinterest:scrape", ...opts });
}

function scrapeYoutube(input, opts) {
  return apifyRunSync(ACTORS.youtube.scraper, input, { label: "youtube:scrape", ...opts });
}

function scrapeX(input, opts) {
  return apifyRunSync(ACTORS.x.scraper, input, { label: "x:scrape", ...opts });
}

function scrapeThreads(input, opts) {
  return apifyRunSync(ACTORS.threads.scraper, input, { label: "threads:scrape", ...opts });
}

function scrapeSnapchat(input, opts) {
  return apifyRunSync(ACTORS.snapchat.scraper, input, { label: "snapchat:scrape", ...opts });
}

module.exports = {
  scrapeReddit,
  scrapePinterest,
  scrapeYoutube,
  scrapeX,
  scrapeThreads,
  scrapeSnapchat,
};
