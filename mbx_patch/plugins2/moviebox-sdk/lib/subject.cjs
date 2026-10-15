'use strict';
/** Movies / TV subjects — /wefeed-mobile-bff/subject-api/* */
const { SUBJECT } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: SUBJECT,
  /** Browse/filter movie list. query: { page, pageSize, ...filters } */
  list: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_LIST, query),
  /** Subject detail. query: { subjectId } (param name inferred) */
  detail: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_GET, query),
  /** Playback info (stream URLs live here). query: { subjectId, ... } */
  playInfo: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_PLAY_INFO, query),
  /** Related recommendations for a subject. */
  playRelatedRec: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_PLAY_RELATED_REC, query),
  /** Daily movie recommendations. */
  dailyMovieRec: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_DAILY_MOVIE_REC, query),
  /** Downloadable resource metadata (step 1 of offline download). */
  resource: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_RESOURCE, query),
  /** Resume position for a resource. */
  resourcePosition: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_RESOURCE_POSITION, query),
  /** Begin an offline download task (step 2). */
  startDownloadResource: (c, body = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_START_DOWNLOAD_RESOURCE, body),
  /** Finish/acknowledge an offline download task (step 3). */
  finishDownloadResource: (c, body = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_FINISH_DOWNLOAD_RESOURCE, body),
  /** Search. Current endpoint expects POST JSON body: { keyword, type, page, pageSize }. */
  search: (c, query = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH, {
    keyword: query.keyword || '',
    type: query.type ?? 0,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? query.perPage ?? 20,
  }),
  /** V2 search uses the same POST style when supported by the upstream. */
  searchV2Post: (c, query = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH_V2, {
    keyword: query.keyword || '',
    type: query.type ?? 0,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? query.perPage ?? 20,
  }),
  searchV2: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH_V2, query),
  searchSuggest: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH_SUGGEST, query),
  searchRank: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH_RANK, query),
  searchRankV2: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEARCH_RANK_V2, query),
  /** Filter chips/options. */
  filterItems: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_FILTER_ITEMS, query),
  /** Trending list (v2). */
  trendingV2: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_TRENDING_V2, query),
  /** Season / episode info. */
  seasonInfo: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEASON_INFO, query),
  /** Cast & crew. */
  staffInfo: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_STAFF_INFO, query),
  staffRelated: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_STAFF_RELATED, query),
  staffSubjectList: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_STAFF_SUBJECT_LIST, query),
  /** Subtitles. */
  subtitleSearch: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SUBTITLE_SEARCH, query),
  getExtCaptions: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_GET_EXT_CAPTIONS, query),
  getStreamCaptions: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_GET_STREAM_CAPTIONS, query),
  dubInfo: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_DUB_INFO, query),
  /** Watch-state toggles. */
  haveSeen: (c, body = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_HAVE_SEEN, body),
  wantToSee: (c, body = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_WANT_TO_SEE, body),
  wantToSeeStaff: (c, body = {}) => post(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_WANT_TO_SEE_STAFF, body),
  seeListV2: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_SEE_LIST_V2, query),
  bottomTab: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_BOTTOM_TAB, query),
  widget: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_WIDGET, query),
  detailRec: (c, query = {}) => get(c, SUBJECT.WEFEED_MOBILE_BFF_SUBJECT_API_DETAIL_REC, query),
};
