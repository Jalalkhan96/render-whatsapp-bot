const path = require('path');
require(path.join(__dirname, '..', 'env')).loadEnv();

const apify = require(path.join(__dirname, '..', '..', 'plugin3', 'apify-rotator-kit'));

function arr(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  for (const k of ['items','results','data','videos','posts','users','profiles','jobs','dataset','entries']) {
    if (Array.isArray(v[k])) return v[k];
  }
  return [];
}

function envJson(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

async function run(label, fn, input) {
  console.log(`[abix-social:${label}] input`, JSON.stringify(input));
  const data = await fn(input, { label: `abix:${label}`, maxAttempts: Number(process.env.ABIX_APIFY_MAX_ATTEMPTS || 10) });
  const out = arr(data);
  console.log(`[abix-social:${label}] received ${out.length} item(s)`);
  return out;
}

function normalize(item, platform, index) {
  const a = item || {};
  const authorObj = a.author || a.owner || a.user || a.authorMeta || a.ownerProfile || {};
  const stats = a.stats || a.statistics || {};
  const author = a.authorName || a.username || a.ownerUsername || a.handle || a.authorMeta?.name || a.authorMeta?.nickName || authorObj.username || authorObj.name || authorObj.uniqueId || 'Unknown creator';
  const title = a.title || a.desc || a.description || a.caption || a.text || a.name || a.videoDescription || `${platform.toUpperCase()} result ${index + 1}`;
  const url = a.webVideoUrl || a.url || a.permalink || a.postUrl || a.shortUrl || a.shareUrl || a.link || a.webpageUrl || a.videoUrl || a.profileUrl || a.inputUrl || '';
  const thumb = a.thumbnail || a.thumbnailUrl || a.cover || a.coverUrl || a.displayUrl || a.imageUrl || a.image || a.previewImageUrl || a.videoMeta?.coverUrl || a.videoMeta?.cover || authorObj.profilePic || '';
  const video = a.videoUrl || a.downloadUrl || a.downloadAddr || a.playAddr || a.video?.downloadAddr || a.video?.url || a.videoMeta?.downloadAddr || a.videoMeta?.playAddr || '';
  const audio = a.musicUrl || a.music?.playUrl || a.music?.url || a.musicMeta?.playUrl || a.musicMeta?.musicUrl || a.audioUrl || '';
  const views = a.playCount ?? a.viewCount ?? stats.views ?? stats.viewCount ?? stats.playCount ?? 0;
  const likes = a.diggCount ?? a.likeCount ?? stats.likes ?? stats.likeCount ?? 0;
  const comments = a.commentCount ?? stats.comments ?? stats.commentCount ?? 0;
  const shares = a.shareCount ?? stats.shares ?? stats.shareCount ?? 0;
  const saves = a.collectCount ?? a.saveCount ?? stats.saves ?? stats.saveCount ?? 0;
  const reposts = a.repostCount ?? a.reposts ?? a.repost_count ?? stats.reposts ?? stats.repostCount ?? 0;
  return { raw: a, platform, author: String(author), title: String(title), url: String(url), thumb: String(thumb), video: String(video), audio: String(audio), stats: { views, likes, comments, shares, saves, reposts } };
}

function five(items, platform) {
  return items.slice(0, 5).map((x, i) => normalize(x, platform, i));
}

async function tiktok(query) {
  const input = envJson('ABIX_TIKTOK_SEARCH_INPUT', { searchQueries: [query], resultsPerPage: 10 });
  if (input.searchQueries) input.searchQueries = [query];
  return five(await run('tiktok', apify.tiktok.scrape, input), 'tiktok');
}

async function instagram(query) {
  const input = envJson('ABIX_INSTAGRAM_SEARCH_INPUT', { search: query, resultsLimit: 10 });
  if ('search' in input) input.search = query;
  if ('searchQueries' in input) input.searchQueries = [query];
  return five(await run('instagram', apify.instagram.search, input), 'instagram');
}

async function facebook(query) {
  const input = envJson('ABIX_FACEBOOK_SEARCH_INPUT', { searchQueries: [query], resultsLimit: 10 });
  if ('searchQueries' in input) input.searchQueries = [query];
  if ('search' in input) input.search = query;
  return five(await run('facebook', apify.facebook.search, input), 'facebook');
}

async function reddit(query) {
  const input = envJson('ABIX_REDDIT_SEARCH_INPUT', { searches: [{ term: query, sort: 'relevance' }], resultsLimit: 10 });
  return five(await run('reddit', apify.reddit.scrape, input), 'reddit');
}

async function pinterest(query) {
  const input = envJson('ABIX_PINTEREST_SEARCH_INPUT', {search: query, resultsLimit: 10});
  return five(await run('pinterest', apify.pinterest.scrape, input), 'pinterest');
}

async function youtube(query) {
  const input = envJson('ABIX_YOUTUBE_SEARCH_INPUT', {searchQueries: [query], maxResults: 10});
  if ('searchQueries' in input) input.searchQueries = [query];
  if ('query' in input) input.query = query;
  return five(await run('youtube', apify.youtube.scrape, input), 'youtube');
}

async function x(query) {
  const input = envJson('ABIX_X_SEARCH_INPUT', {searchTerms: [query], maxItems: 10});
  if ('searchTerms' in input) input.searchTerms = [query];
  if ('query' in input) input.query = query;
  return five(await run('x', apify.x.scrape, input), 'x');
}

async function linkedinPeople(query) {
  const input = envJson('ABIX_LINKEDIN_PEOPLE_INPUT', {keywords: query, limit: 10});
  if ('keywords' in input) input.keywords = query;
  return five(await run('linkedin-people', apify.linkedin.searchProfiles, input), 'linkedin');
}

async function linkedinJobs(query) {
  const input = envJson('ABIX_LINKEDIN_JOBS_INPUT', {keywords: query, location: process.env.ABIX_LINKEDIN_LOCATION || 'Pakistan', limit: 10});
  if ('keywords' in input) input.keywords = query;
  return five(await run('linkedin-jobs', apify.linkedin.scrapeJobs, input), 'linkedin-jobs');
}

async function threads(query) {
  const input = envJson('ABIX_THREADS_SEARCH_INPUT', {search: query, resultsLimit: 10});
  if ('search' in input) input.search = query;
  return five(await run('threads', apify.threads.scrape, input), 'threads');
}

async function snapchat(query) {
  const input = envJson('ABIX_SNAPCHAT_SEARCH_INPUT', {search: query, resultsLimit: 10});
  if ('search' in input) input.search = query;
  return five(await run('snapchat', apify.snapchat.scrape, input), 'snapchat');
}

module.exports = { tiktok, instagram, facebook, reddit, pinterest, youtube, x, linkedinPeople, linkedinJobs, threads, snapchat };
