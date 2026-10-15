import { normalizeTikTokItem } from "./normalizers/tiktok.mjs";
import { runActor, apifyTokenCount } from "./apifyPool.mjs";

export const ACTORS = {
  tiktok:{search:"clockworks/tiktok-scraper",comments:"clockworks/tiktok-comments-scraper",profile:"clockworks/tiktok-profile-scraper",hashtag:"clockworks/tiktok-hashtag-scraper",video:"clockworks/tiktok-video-scraper"},
  instagram:{all:"apify/instagram-scraper",search:"apify/instagram-search-scraper",profile:"apify/instagram-profile-scraper",comments:"apify/instagram-comment-scraper"},
  facebook:{search:"apify/facebook-search-scraper",posts:"apify/facebook-posts-scraper",comments:"apify/facebook-comments-scraper"},
  reddit:{all:"hipersoft/reddit-scraper"}, pinterest:{all:"subimpact/pinterest-scraper"}, youtube:{all:"automation-lab/youtube-scraper"}, x:{all:"forge-api/x-scraper"},
  linkedin:{people:"harvestapi/linkedin-profile-search",posts:"apimaestro/linkedin-profile-posts",jobs:"bebity/linkedin-jobs-scraper"},
  threads:{all:"lergassy/threads-scraper"}, snapchat:{profile:"automation-lab/snapchat-scraper"},
  pinterestLens:"dev00/pinterest-lens-apify"
};
async function run(op,actorId,input){ const r=await runActor(actorId,input); return {actorId,runId:null,datasetId:null,...r}; }
export { apifyTokenCount };

// TikTok
export async function tiktokSearch(
  query,
  { resultsPerPage = 5, commentsPerPost = 0, proxyCountryCode = "None" } = {}
) {
  const result = await run("tiktok.search", ACTORS.tiktok.search, {
    searchQueries: [query],
    resultsPerPage,
    commentsPerPost,
    proxyCountryCode
  });
  return {
    ...result,
    items: result.items
      .map((item, index) => normalizeTikTokItem(item, index))
      .filter(item => item.id || item.page || item.title)
      .slice(0, resultsPerPage),
  };
}

export async function tiktokHashtag(
  hashtag,
  { resultsPerPage = 50, commentsPerPost = 0, proxyCountryCode = "None" } = {}
) {
  return run("tiktok.search", ACTORS.tiktok.search, {
    hashtags: [String(hashtag).replace(/^#/, "")],
    resultsPerPage,
    commentsPerPost,
    proxyCountryCode
  });
}

export async function tiktokComments(
  videoUrl,
  { commentsPerPost = 100, maxRepliesPerComment = 0, resultsPerPage = 100 } = {}
) {
  return run("tiktok.comments", ACTORS.tiktok.comments, {
    postURLs: [videoUrl],
    commentsPerPost,
    maxRepliesPerComment,
    resultsPerPage
  });
}

export async function tiktokProfile(username, options = {}) {
  return run("tiktok.profile", ACTORS.tiktok.profile, {
    profiles: [username],
    ...options
  });
}

export async function tiktokVideo(url, options = {}) {
  return run("tiktok.video", ACTORS.tiktok.video, {
    postURLs: [url],
    ...options
  });
}

// Instagram
export async function instagramSearch(query, {
  searchType = "popular",
  searchLimit = 25
} = {}) {
  return run("instagram.search", ACTORS.instagram.search, {
    search: query,
    searchType,
    searchLimit
  });
}

export async function instagramProfile(usernames) {
  const arr = Array.isArray(usernames) ? usernames : [usernames];

  return run("instagram.profile", ACTORS.instagram.profile, {
    usernames: arr
  });
}

export async function instagramComments(urls) {
  const arr = Array.isArray(urls) ? urls : [urls];

  return run("instagram.comments", ACTORS.instagram.comments, {
    startUrls: arr.map((url) => ({ url }))
  });
}

export async function instagramAll(input) {
  return run("instagram.all", ACTORS.instagram.all, input);
}

// Facebook
export async function facebookSearch(query) {
  return run("facebook.search", ACTORS.facebook.search, {
    searchQueries: [query]
  });
}

export async function facebookPosts(pageUrl, options = {}) {
  return run("facebook.posts", ACTORS.facebook.posts, {
    startUrls: [{ url: pageUrl }],
    ...options
  });
}

export async function facebookComments(urls) {
  const arr = Array.isArray(urls) ? urls : [urls];

  return run("facebook.comments", ACTORS.facebook.comments, {
    startUrls: arr.map((url) => ({ url }))
  });
}

// Reddit
export async function redditSearch(query, {
  maxItems = 50,
  includeComments = false,
  maxComments = 0,
  sort = "relevance",
  time = "week"
} = {}) {
  return run("reddit.all", ACTORS.reddit.all, {
  // hipersoft/reddit-scraper calls this field `searches` (not the
  // `searchQueries` field used by the TikTok/Facebook actors).
  searches: [query],
    sort,
    time,
    maxItems,
    includeComments,
    maxComments
  });
}

export async function redditPost(postUrl, { maxComments = 100 } = {}) {
  return run("reddit.all", ACTORS.reddit.all, {
    postUrls: [postUrl],
    includeComments: true,
    maxItems: 1,
    maxComments
  });
}

export async function redditSubreddit(subreddit, options = {}) {
  const clean = String(subreddit).replace(/^r\//, "").replace(/\/.*$/, "");

  return run("reddit.all", ACTORS.reddit.all, {
    subreddits: [
      clean.startsWith("http")
        ? clean
        : `https://www.reddit.com/r/${clean}`
    ],
    ...options
  });
}

// Pinterest
export async function pinterestSearch(query, {
  maxPinsPerSource = 25,
  downloadMedia = false,
  enrichDetails = false
} = {}) {
  return run("pinterest.all", ACTORS.pinterest.all, {
    mode: "search",
    queries: query,
    maxPinsPerSource,
    imageSize: "orig",
    downloadMedia,
    enrichDetails,
    includeRaw: false
  });
}

export async function pinterestBoard(boardUrl, options = {}) {
  return run("pinterest.all", ACTORS.pinterest.all, {
    mode: "board",
    boardUrls: boardUrl,
    maxPinsPerSource: options.maxPinsPerSource ?? 100,
    imageSize: "orig",
    downloadMedia: options.downloadMedia ?? false,
    enrichDetails: options.enrichDetails ?? false,
    includeRaw: false
  });
}

export async function pinterestLens(imageBase64, { maxResults = 5 } = {}) {
  if (!imageBase64) throw new Error("Pinterest Lens requires an image.");
  const safeLimit = Math.max(1, Math.min(10, Number(maxResults) || 5));
  return run("pinterest.lens", ACTORS.pinterestLens, {
    image_base64: imageBase64,
    max_results: safeLimit,
    include_metadata: true,
    include_raw: false
  });
}

export async function pinterestProfile(username, options = {}) {
  return run("pinterest.all", ACTORS.pinterest.all, {
    mode: "profile",
    usernames: username,
    maxPinsPerSource: options.maxPinsPerSource ?? 100,
    imageSize: "orig",
    downloadMedia: options.downloadMedia ?? false,
    enrichDetails: options.enrichDetails ?? false,
    includeRaw: false
  });
}

// YouTube
export async function youtubeSearch(query, {
  maxResults = 20,
  sortBy = "relevance",
  language = "en",
  country = "PK",
  maxComments = 0
} = {}) {
  return run("youtube.all", ACTORS.youtube.all, {
    searchQueries: [query],
    maxResults,
    maxComments,
    sortBy,
    language,
    country
  });
}

export async function youtubeVideo(videoUrls, { maxComments = 100 } = {}) {
  const arr = Array.isArray(videoUrls) ? videoUrls : [videoUrls];

  return run("youtube.all", ACTORS.youtube.all, {
    videoUrls: arr,
    maxComments
  });
}

export async function youtubeChannel(channelUrls, { maxResults = 50 } = {}) {
  const arr = Array.isArray(channelUrls) ? channelUrls : [channelUrls];

  return run("youtube.all", ACTORS.youtube.all, {
    channelUrls: arr,
    maxResults
  });
}

// X
export async function xSearch(query, {
  searchType = "tweets",
  maxItems = 50,
  maxPages = 1,
  mediaOnly = false,
  includeReplies = false,
  includeRetweets = true
} = {}) {
  return run("x.all", ACTORS.x.all, {
    searchTerms: [query],
    searchType,
    maxItems,
    maxPages,
    mediaOnly,
    includeReplies,
    includeRetweets
  });
}

export async function xProfile(handles, { maxItems = 50 } = {}) {
  const arr = Array.isArray(handles) ? handles : [handles];

  return run("x.all", ACTORS.x.all, {
    twitterHandles: arr,
    searchType: "profile_tweets",
    maxItems
  });
}

// LinkedIn
export async function linkedinPeople(search, {
  maxItems = 25,
  locations = []
} = {}) {
  return run("linkedin.people", ACTORS.linkedin.people, {
    search,
    maxItems,
    locations
  });
}

export async function linkedinPosts(targetUrls, options = {}) {
  const arr = Array.isArray(targetUrls) ? targetUrls : [targetUrls];

  return run("linkedin.posts", ACTORS.linkedin.posts, {
    targetUrls: arr,
    scrapeComments: options.scrapeComments ?? false,
    scrapeReactions: options.scrapeReactions ?? false,
    maxComments: options.maxComments ?? 0,
    maxReactions: options.maxReactions ?? 0
  });
}

export async function linkedinJobs(titles, locations = [], options = {}) {
  const titleArr = Array.isArray(titles) ? titles : [titles];
  const locationArr = (Array.isArray(locations) ? locations : [locations]).filter(Boolean);

  return run("linkedin.jobs", ACTORS.linkedin.jobs, {
    titles: titleArr,
    locations: locationArr,
    publishedAt: options.publishedAt ?? "",
    maxItems: options.maxItems ?? 50,
    easyApply: options.easyApply ?? false
  });
}

// Threads
export async function threadsSearch(keywords, {
  maxPosts = 50,
  searchTypes = ["top", "recent", "tags"]
} = {}) {
  const arr = Array.isArray(keywords) ? keywords : [keywords];

  return run("threads.all", ACTORS.threads.all, {
    mode: "search",
    keywords: arr,
    maxPosts,
    searchTypes
  });
}

export async function threadsProfile(usernames, { maxPosts = 50 } = {}) {
  const arr = Array.isArray(usernames) ? usernames : [usernames];

  return run("threads.all", ACTORS.threads.all, {
    mode: "posts",
    usernames: arr,
    maxPosts,
    includeProfile: true
  });
}

export async function threadsThread(postUrls, { maxRepliesPerPost = 100 } = {}) {
  const arr = Array.isArray(postUrls) ? postUrls : [postUrls];

  return run("threads.all", ACTORS.threads.all, {
    mode: "thread",
    postUrls: arr,
    maxRepliesPerPost
  });
}

// Snapchat
export async function snapchatProfiles(usernames) {
  const arr = Array.isArray(usernames) ? usernames : [usernames];

  return run("snapchat.profile", ACTORS.snapchat.profile, {
    usernames: arr
  });
}
