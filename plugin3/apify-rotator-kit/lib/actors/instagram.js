const { apifyRunSync } = require("../apifyClient");
const ACTORS = require("./registry").instagram;

function scrape(input, opts) {
  return apifyRunSync(ACTORS.scraper, input, { label: "instagram:scrape", ...opts });
}

function search(input, opts) {
  return apifyRunSync(ACTORS.searchScraper, input, { label: "instagram:search", ...opts });
}

function scrapeProfile(input, opts) {
  return apifyRunSync(ACTORS.profileScraper, input, { label: "instagram:profile", ...opts });
}

function scrapeComments(input, opts) {
  return apifyRunSync(ACTORS.commentScraper, input, { label: "instagram:comments", ...opts });
}

module.exports = { scrape, search, scrapeProfile, scrapeComments };
