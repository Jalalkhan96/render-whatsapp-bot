// Central place to change an actor slug if Apify renames one, without touching call sites.
module.exports = {
  tiktok: {
    scraper: "clockworks/tiktok-scraper",
    commentsScraper: "clockworks/tiktok-comments-scraper",
    profileScraper: "clockworks/tiktok-profile-scraper",
    hashtagScraper: "clockworks/tiktok-hashtag-scraper",
    videoScraper: "clockworks/tiktok-video-scraper",
  },
  instagram: {
    scraper: "apify/instagram-scraper",
    searchScraper: "apify/instagram-search-scraper",
    profileScraper: "apify/instagram-profile-scraper",
    commentScraper: "apify/instagram-comment-scraper",
  },
  facebook: {
    searchScraper: "apify/facebook-search-scraper",
    postsScraper: "apify/facebook-posts-scraper",
    commentsScraper: "apify/facebook-comments-scraper",
  },
  reddit: {
    scraper: "hipersoft/reddit-scraper",
  },
  pinterest: {
    scraper: "subimpact/pinterest-scraper",
  },
  youtube: {
    scraper: "automation-lab/youtube-scraper",
  },
  x: {
    scraper: "forge-api/x-scraper",
  },
  linkedin: {
    profileSearch: "harvestapi/linkedin-profile-search",
    profilePosts: "apimaestro/linkedin-profile-posts",
    jobsScraper: "bebity/linkedin-jobs-scraper",
  },
  threads: {
    scraper: "lergassy/threads-scraper",
  },
  snapchat: {
    scraper: "automation-lab/snapchat-scraper",
  },
};
