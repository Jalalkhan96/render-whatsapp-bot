'use strict';
/** UGC video — /wefeed-mobile-bff/ugc/* and favorite/ugc-video/* */
const { UGC } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: UGC,
  /** Playback info for a UGC video. */
  play: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_PLAY, query),
  playMulti: (c, body = {}) => post(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_PLAY_MULTI, body),
  videoGet: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_GET, query),
  /** Offline-download handshake for UGC. */
  videoDownload: (c, body = {}) => post(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_DOWNLOAD, body),
  startDownload: (c, body = {}) => post(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_START_DOWNLOAD, body),
  finishDownload: (c, body = {}) => post(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_FINISH_DOWNLOAD, body),
  caption: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_CAPTION, query),
  firstBySubject: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_FIRST_BY_SUBJECT, query),
  listByMy: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_LIST_BY_MY, query),
  listByUser: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_LIST_BY_USER, query),
  listLikes: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_VIDEO_LIST_LIKES, query),
  /** Trending feeds. */
  trendingHome: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_HOME, query),
  trendingImmersive: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_IMMERSIVE, query),
  trendingByDownload: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_BY_DOWNLOAD, query),
  trendingByHashtag: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_BY_HASHTAG, query),
  trendingByUgcVideo: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_BY_UGC_VIDEO, query),
  trendingChannel: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_CHANNEL, query),
  trendingSubscribe: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_SUBSCRIBE, query),
  trendingFilterEdu: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_TRENDING_FILTER_EDU, query),
  /** Search. */
  searchResult: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_SEARCH_RESULT, query),
  searchSuggest: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_SEARCH_SUGGEST, query),
  searchRank: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_SEARCH_RANK, query),
  searchEveryone: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_SEARCH_EVERYONE, query),
  /** Collections. */
  collectionDownloadList: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_COLLECTION_DOWNLOAD_LIST, query),
  collectionPlayList: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_COLLECTION_PLAY_LIST, query),
  collectionResolution: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_COLLECTION_RESOLUTION, query),
  categoryLev1SubList: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_CATEGORY_LEV1_SUB_LIST, query),
  genreTop: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_OPERATING_GENRE_TOP, query),
  tabOperating: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_OPERATING_TAB_OPERATING, query),
  tabRankList: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_UGC_OPERATING_TAB_RANK_LIST, query),
  /** Favorites. */
  favoriteList: (c, query = {}) => get(c, UGC.WEFEED_MOBILE_BFF_FAVORITE_UGC_VIDEO_LIST, query),
  favoriteToggle: (c, body = {}) => post(c, UGC.WEFEED_MOBILE_BFF_FAVORITE_UGC_VIDEO_TOGGLE, body),
};
