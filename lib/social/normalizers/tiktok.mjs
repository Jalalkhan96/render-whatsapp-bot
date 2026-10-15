function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function mediaUrl(...values) {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (value && typeof value === "object") {
      const nested = mediaUrl(
        value.url,
        value.uri,
        value.playAddr,
        value.downloadAddr,
        value.urlList
      );
      if (nested) return nested;
    }
    if (Array.isArray(value)) {
      const nested = mediaUrl(...value);
      if (nested) return nested;
    }
  }
  return null;
}

export function normalizeTikTokItem(item = {}, index = 0) {
  if (!item || typeof item !== "object") item = {};
  const author = item.authorMeta || item.author || item.user || {};
  const video = item.videoMeta || {};
  const music = item.musicMeta || {};
  const canonicalUrl = item.webVideoUrl || item.webVideoUrlNoWaterMark || item.url || null;

  return {
    index,
    id: item.id || item.awemeId || item.videoId || null,
    platform: 'tiktok',
    page: canonicalUrl,
    canonicalUrl,
    title: item.text || item.desc || item.description || 'TikTok Video',
    description: item.text || item.desc || item.description || null,
    author: {
      username: author.uniqueId || author.unique_id || author.name || author.username || null,
      nickname: author.nickName || author.nickname || author.displayName || null,
      profileUrl: author.profileUrl || author.profile_url || null,
      avatar: author.avatar || author.avatarLarger || author.avatarUrl || null,
      verified: Boolean(author.verified),
    },
    thumbnail: video.coverUrl || video.originalCoverUrl || null,
    // clockworks/tiktok-scraper exposes these under videoMeta.  Leaving this
    // null makes the carousel buttons fail even though the actor returned a
    // perfectly usable media URL.
    video: mediaUrl(
      video.downloadAddr,
      video.playAddr,
      video.downloadUrl,
      video.url,
      item.videoUrl,
      item.downloadUrl,
      item.playAddr
    ),
    audio: mediaUrl(music.playUrl, music.playUrlList, item.musicUrl),
    music: {
      name: music.musicName || null,
      author: music.musicAuthor || null,
      album: music.musicAlbum || null,
      id: music.musicId || null,
      original: Boolean(music.musicOriginal),
    },
    duration: number(video.duration),
    dimensions: {
      width: number(video.width),
      height: number(video.height),
      definition: video.definition || null,
      format: video.format || null,
    },
    stats: {
      views: number(item.playCount),
      likes: number(item.diggCount),
      comments: number(item.commentCount),
      shares: number(item.shareCount),
      saves: number(item.collectCount),
      reposts: number(item.repostCount),
    },
    hashtags: Array.isArray(item.hashtags)
      ? item.hashtags.map(tag => tag?.name).filter(Boolean)
      : [],
    createdAt: item.createTimeISO || item.createTime || item.timestamp || null,
    language: item.textLanguage || null,
    isAd: Boolean(item.isAd),
    isSponsored: Boolean(item.isSponsored),
    isSlideshow: Boolean(item.isSlideshow),
    raw: item,
  };
}
