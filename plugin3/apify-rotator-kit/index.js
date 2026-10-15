// Entry point — require("./apify-rotator-kit") from your bot and use these namespaces.
const { callApify, apifyRunSync, rotator } = require("./lib/apifyClient");

const tiktok = require("./lib/actors/tiktok");
const instagram = require("./lib/actors/instagram");
const facebook = require("./lib/actors/facebook");
const linkedin = require("./lib/actors/linkedin");
const misc = require("./lib/actors/misc");

function status() {
  return rotator.status();
}

function statusText() {
  return rotator
    .status()
    .map(
      (s) =>
        `${s.id}: ${s.available ? "✅ available" : `⛔ ${s.cooldownReason} (${Math.ceil(
          s.cooldownRemainingMs / 60000
        )}m left)`} | success=${s.successCount} fail=${s.failCount}`
    )
    .join("\n");
}

module.exports = {
  // low-level, for calling an actor not in the registry yet
  callApify,
  apifyRunSync,
  rotator,
  status,
  statusText,

  // ready-made wrappers per platform
  tiktok,
  instagram,
  facebook,
  reddit: { scrape: misc.scrapeReddit },
  pinterest: { scrape: misc.scrapePinterest },
  youtube: { scrape: misc.scrapeYoutube },
  x: { scrape: misc.scrapeX },
  linkedin,
  threads: { scrape: misc.scrapeThreads },
  snapchat: { scrape: misc.scrapeSnapchat },
};
