'use strict';
/** Shorts — /wefeed-mobile-bff/shorts/*, /wefeed-short-bff/*, /wefeed-fm-bff/shorts/* */
const { SHORTS } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: SHORTS,
  getInfo: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_GET_INFO, query),
  miniList: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_MINI_LIST, query),
  mostTrending: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_MOST_TRENDING, query),
  favorite: (c, body = {}) => post(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_FAVORITE, body),
  favoriteList: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_FAVORITE_LIST, query),
  dubInfo: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_DUB_INFO, query),
  getMiniCaptions: (c, query = {}) => get(c, SHORTS.WEFEED_MOBILE_BFF_SHORTS_GET_MINI_CAPTIONS, query),
  /** Short-bff variant. */
  shortBffGetMiniCaptions: (c, query = {}) => get(c, SHORTS.WEFEED_SHORT_BFF_SHORTS_GET_MINI_CAPTIONS, query),
  /** FM-bff variants. */
  fmPlaylistContent: (c, query = {}) => get(c, SHORTS.WEFEED_FM_BFF_SHORTS_PLAYLIST_CONTENT, query),
  fmSubjectList: (c, query = {}) => get(c, SHORTS.WEFEED_FM_BFF_SHORTS_SUBJECT_LIST, query),
  fmSubjectFilterItems: (c, query = {}) => get(c, SHORTS.WEFEED_FM_BFF_SHORTS_SUBJECT_FILTER_ITEMS, query),
};
