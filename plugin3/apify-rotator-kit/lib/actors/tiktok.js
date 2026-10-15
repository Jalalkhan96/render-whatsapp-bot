const { apifyRunSync } = require("../apifyClient");
const ACTORS = require("./registry").tiktok;

/** General TikTok scraper — pass Apify's normal input shape (search terms, URLs, etc). */
function scrape(input, opts) {
  return apifyRunSync(ACTORS.scraper, input, { label: "tiktok:scrape", ...opts });
}

/** Comments for one or more TikTok video URLs. */
function scrapeComments(input, opts) {
  return apifyRunSync(ACTORS.commentsScraper, input, { label: "tiktok:comments", ...opts });
}

/** Profile info/videos for one or more TikTok usernames. */
function scrapeProfile(input, opts) {
  return apifyRunSync(ACTORS.profileScraper, input, { label: "tiktok:profile", ...opts });
}

/** Videos under a given hashtag. */
function scrapeHashtag(input, opts) {
  return apifyRunSync(ACTORS.hashtagScraper, input, { label: "tiktok:hashtag", ...opts });
}

/** Detail scrape for specific TikTok video URLs. */
function scrapeVideo(input, opts) {
  return apifyRunSync(ACTORS.videoScraper, input, { label: "tiktok:video", ...opts });
}

module.exports = { scrape, scrapeComments, scrapeProfile, scrapeHashtag, scrapeVideo };
