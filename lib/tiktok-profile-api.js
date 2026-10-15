const CACHE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map();

function normalizeTikTokUsername(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Give a TikTok username or profile URL.');

  let username = raw;
  if (/^https?:\/\//i.test(raw)) {
    let parsed;
    try { parsed = new URL(raw); } catch { throw new Error('That TikTok profile URL is invalid.'); }
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'www.tiktok.com')) {
      throw new Error('Use a TikTok profile URL, such as https://www.tiktok.com/@username.');
    }
    const match = parsed.pathname.match(/\/@([^/]+)/);
    if (!match) throw new Error('The URL must point to a TikTok profile, not a video.');
    username = match[1];
  }
  username = username.replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9._]{2,30}$/.test(username)) {
    throw new Error('Invalid username. Use 2–30 letters, numbers, dots, or underscores.');
  }
  return username;
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function findAuthor(item) {
  return item?.authorMeta || item?.author || item?.profile || item?.user || item?.userInfo || item;
}

function normalizeResult(items, requestedUsername) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Apify returned no public profile data. The profile may be unavailable, private, or temporarily blocked.');
  }

  const candidate = items.find((item) => {
    const a = findAuthor(item);
    return a && (a.name || a.uniqueId || a.nickname || a.nickName || a.fans !== undefined || a.followers !== undefined || a.signature || a.avatar);
  }) || items[0];
  const author = findAuthor(candidate) || {};

  const username = String(pick(author.uniqueId, author.username, author.name, author.secUid, requestedUsername));
  const name = String(pick(author.nickName, author.nickname, author.displayName, author.name, username));
  const profileUrl = String(pick(author.profileUrl, author.profileURL, author.url, `https://www.tiktok.com/@${requestedUsername}`));
  return {
    username: username.replace(/^@/, ''),
    displayName: name,
    bio: String(pick(author.signature, author.bio, author.description, '')),
    followers: asNumber(pick(author.fans, author.followerCount, author.followers, author.stats?.followerCount)),
    following: asNumber(pick(author.following, author.followingCount, author.stats?.followingCount)),
    likes: asNumber(pick(author.heart, author.heartCount, author.likes, author.stats?.heartCount)),
    videos: asNumber(pick(author.video, author.videoCount, author.video_count, author.stats?.videoCount)),
    verified: Boolean(pick(author.verified, author.isVerified, false)),
    privateAccount: Boolean(pick(author.privateAccount, author.isPrivate, false)),
    avatarUrl: pick(author.originalAvatarUrl, author.avatar, author.avatarUrl, author.avatarLarger, author.avatarMedium),
    profileUrl,
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchTikTokProfile(input, options = {}) {
  const username = normalizeTikTokUsername(input);
  const useCache = options.cache !== false;
  const cached = profileCache.get(username.toLowerCase());
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.profile;

  const token = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
  if (!token) throw new Error('Apify is not configured. Add APIFY_API_TOKEN to your bot .env and restart it.');

  const actorId = process.env.APIFY_TIKTOK_PROFILE_ACTOR || 'clockworks~tiktok-profile-scraper';
  if (!/^[A-Za-z0-9~._-]+$/.test(actorId)) throw new Error('APIFY_TIKTOK_PROFILE_ACTOR contains invalid characters.');

  const apiUrl = new URL(`https://api.apify.com/v2/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);
  apiUrl.searchParams.set('timeout', '120');
  apiUrl.searchParams.set('maxItems', '1');
  apiUrl.searchParams.set('format', 'json');

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        profiles: [username],
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        resultsPerPage: 1,
        maxFollowersPerProfile: 0,
        maxFollowingPerProfile: 0,
        commentsPerPost: 0,
        topLevelCommentsPerPost: 0,
        maxRepliesPerComment: 0,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadAvatars: false,
      }),
      signal: AbortSignal.timeout(125_000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Apify timed out. Try again in a moment.');
    }
    throw new Error('Could not reach Apify. Check the server network connection and try again.');
  }

  const rawText = await response.text();
  let payload;
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { payload = null; }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Apify rejected the token or Actor permissions. Check APIFY_API_TOKEN and the Actor access.');
    if (response.status === 402) throw new Error('Apify reports insufficient balance or a billing limit.');
    if (response.status === 408) throw new Error('Apify Actor timed out. Try again later.');
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`Apify request failed: ${String(detail).slice(0, 180)}`);
  }

  const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
  const profile = normalizeResult(items, username);
  profileCache.set(username.toLowerCase(), { profile, expiresAt: Date.now() + CACHE_TTL_MS });
  return profile;
}

function formatCount(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

function buildTikTokProfileCaption(profile) {
  const bio = String(profile.bio || '—').replace(/[\r\n]+/g, ' ').slice(0, 220);
  return [
    '╭━━━〔 🎵 TIKTOK PROFILE 〕━━━╮',
    `┃ 👤 Name: ${String(profile.displayName || 'Unknown').slice(0, 80)}`,
    `┃ @${profile.username}`,
    `┃ ✓ Verified: ${profile.verified ? 'Yes' : 'No'}`,
    `┃ 👥 Followers: ${formatCount(profile.followers)}`,
    `┃ ➕ Following: ${formatCount(profile.following)}`,
    `┃ ❤️ Likes: ${formatCount(profile.likes)}`,
    `┃ 🎬 Videos: ${formatCount(profile.videos)}`,
    `┃ 🔒 Private: ${profile.privateAccount ? 'Yes' : 'No'}`,
    `┃ 📝 Bio: ${bio}`,
    '┣━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `┃ 🔗 ${profile.profileUrl}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '_Account details are from publicly available profile data and may be incomplete._',
  ].join('\n');
}

async function fetchAvatarBuffer(avatarUrl, { maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!avatarUrl) return null;
  let url;
  try { url = new URL(avatarUrl); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const allowed = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibytedtos.com', 'byteoversea.com'];
  if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'image/*' } });
    if (!response.ok || !String(response.headers.get('content-type') || '').startsWith('image/')) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > maxBytes) return null;
    return buffer;
  } catch {
    return null;
  }
}


module.exports = {
  normalizeTikTokUsername,
  fetchTikTokProfile,
  formatCount,
  buildTikTokProfileCaption,
  fetchAvatarBuffer,
};
