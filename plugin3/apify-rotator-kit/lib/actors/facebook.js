const { apifyRunSync } = require("../apifyClient");
const ACTORS = require("./registry").facebook;

function search(input, opts) {
  return apifyRunSync(ACTORS.searchScraper, input, { label: "facebook:search", ...opts });
}

function scrapePosts(input, opts) {
  return apifyRunSync(ACTORS.postsScraper, input, { label: "facebook:posts", ...opts });
}

function scrapeComments(input, opts) {
  return apifyRunSync(ACTORS.commentsScraper, input, { label: "facebook:comments", ...opts });
}

module.exports = { search, scrapePosts, scrapeComments };
