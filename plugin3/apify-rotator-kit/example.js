require("dotenv").config();
const apify = require("./index");

(async () => {
  try {
    // TikTok search
    const tiktokResults = await apify.tiktok.scrape({
      searchQueries: ["cats"],
      resultsPerPage: 5,
    });
    console.log("TikTok results:", tiktokResults.length);

    // Instagram profile
    const igProfile = await apify.instagram.scrapeProfile({
      usernames: ["natgeo"],
    });
    console.log("IG profile:", igProfile.length);

    // LinkedIn jobs
    const jobs = await apify.linkedin.scrapeJobs({
      keywords: "flutter developer",
      location: "Pakistan",
    });
    console.log("LinkedIn jobs:", jobs.length);

    // Print key health after the run
    console.log("\n--- Key status ---");
    console.log(apify.statusText());
  } catch (err) {
    if (err.allKeysExhausted) {
      console.error("All Apify keys are exhausted right now:", err.status);
    } else {
      console.error("Run failed:", err.message);
    }
  }
})();
