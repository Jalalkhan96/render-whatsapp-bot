const { apifyRunSync } = require("../apifyClient");
const ACTORS = require("./registry").linkedin;

function searchProfiles(input, opts) {
  return apifyRunSync(ACTORS.profileSearch, input, { label: "linkedin:profile-search", ...opts });
}

function scrapeProfilePosts(input, opts) {
  return apifyRunSync(ACTORS.profilePosts, input, { label: "linkedin:profile-posts", ...opts });
}

function scrapeJobs(input, opts) {
  return apifyRunSync(ACTORS.jobsScraper, input, { label: "linkedin:jobs", ...opts });
}

module.exports = { searchProfiles, scrapeProfilePosts, scrapeJobs };
