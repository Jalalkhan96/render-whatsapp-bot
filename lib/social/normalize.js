function first(value, ...keys) {
  for (const key of keys) {
    const current = value?.[key];
    if (current !== undefined && current !== null && current !== '') return current;
  }
  return null;
}

function urlOf(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = urlOf(entry);
      if (url) return url;
    }
    return null;
  }
  return urlOf(
    value.url ||
    value.uri ||
    value.webVideoUrl ||
    value.webVideoUrlNoWaterMark ||
    value.permalink ||
    value.link ||
    value.href ||
    value.urlList
  );
}

function normalizeSocialItem(item = {}, platform = 'social', type = 'result') {
  const author = item.author || item.authorMeta || item.owner || item.user || item.account || {};
  const stats = item.stats || item.statistics || item.metrics || {};
  const media = item.media || item.assets || {};
  return {
    platform,
    type,
    id: String(first(item, 'id', 'aweme_id', 'videoId', 'postId', 'shortcode') || ''),
    url: urlOf(first(item, 'url', 'webVideoUrl', 'webUrl', 'permalink', 'postUrl', 'shareUrl', 'link', 'href')),
    title: first(item, 'title', 'desc', 'description', 'name') || null,
    text: first(item, 'text', 'caption', 'content', 'body') || null,
    author: {
      username: first(author, 'unique_id', 'uniqueId', 'username', 'userName', 'handle') || null,
      name: first(author, 'nickname', 'name', 'displayName') || null,
      avatar: urlOf(first(author, 'avatar', 'avatar_url', 'avatarLarger', 'profilePicUrl')) || null,
    },
    media: {
      image: urlOf(first(item, 'cover', 'thumbnail', 'image', 'imageUrl', 'displayUrl') || first(media, 'image', 'thumbnail', 'cover', 'displayUrl')) || null,
      video: urlOf(first(item, 'video', 'videoUrl', 'video_url', 'downloadUrl', 'download_addr', 'playAddr', 'play_url', 'video_versions', 'resources') || first(media, 'video', 'videoUrl', 'downloadUrl')) || null,
      audio: urlOf(first(item, 'audio', 'audioUrl', 'music', 'musicUrl', 'audio_url') || first(media, 'audio', 'audioUrl')) || null,
    },
    stats: {
      views: first(item, 'views', 'viewCount', 'play_count') ?? first(stats, 'views', 'viewCount', 'play_count'),
      likes: first(item, 'likes', 'likeCount', 'digg_count') ?? first(stats, 'likes', 'likeCount', 'digg_count'),
      comments: first(item, 'comments', 'commentCount', 'comment_count') ?? first(stats, 'comments', 'commentCount', 'comment_count'),
      shares: first(item, 'shares', 'shareCount', 'share_count') ?? first(stats, 'shares', 'shareCount', 'share_count'),
      reposts: first(item, 'reposts', 'repostCount', 'repost_count') ?? first(stats, 'reposts', 'repostCount', 'repost_count'),
      saves: first(item, 'saves', 'saveCount', 'collectCount', 'collect_count') ?? first(stats, 'saves', 'saveCount', 'collectCount', 'collect_count'),
    },
    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
    createdAt: first(item, 'createdAt', 'createTime', 'timestamp') || null,
    raw: item,
  };
}

function normalizeItems(result, platform, type) {
  const items = Array.isArray(result?.items)
    ? result.items
    : Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.results)
        ? result.results
        : [];
  return items.map(item => normalizeSocialItem(item, platform, type));
}

module.exports = { normalizeSocialItem, normalizeItems };
