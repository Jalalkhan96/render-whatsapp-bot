'use strict';
/** Everything else on the BFF: messaging, feedback, share, learning, live, music, config... */
const { MISC, BFF_MISC, PLATFORM, TRANSFER, DOWNLOAD, OTHER } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: { ...MISC, ...BFF_MISC, ...PLATFORM, ...TRANSFER, ...DOWNLOAD, ...OTHER },
  // messaging
  messageInternalList: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_MESSAGE_INTERNAL_LIST, query),
  messageInternalHasNew: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_MESSAGE_INTERNAL_HAS_NEW, query),
  messageNotifyBarV2: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_MESSAGE_NOTIFY_BAR_V2, query),
  messagePushLocalList: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_MESSAGE_PUSH_LOCAL_LIST, query),
  messageReport: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_MESSAGE_REPORT, body),
  // feedback
  feedbackCommit: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_FEEDBACK_COMMIT, body),
  feedbackReport: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_FEEDBACK_REPORT, body),
  feedbackLabelList: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_FEEDBACK_LABEL_LIST, query),
  // share
  shareShortUrl: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_SHARE_SHORTURL, body),
  shareLongUrl: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_SHARE_LONGURL, body),
  // learning (edu)
  learningAddCourse: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_LEARNING_ADD_COURSE, body),
  learningMyCourse: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_LEARNING_MY_COURSE, query),
  learningPreferOptions: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_LEARNING_PREFER_OPTIONS, query),
  learningSubmitPrefer: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_LEARNING_SUBMIT_PREFER, body),
  // live
  liveMatchDetail: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_LIVE_MATCH_DETAIL, query),
  liveSubUpcomingMatch: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_LIVE_SUB_UPCOMMING_MATCH, query),
  // music / playlist
  musicLike: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_MUSIC_LIKE, body),
  musicLikeList: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_MUSIC_LIKE_LIST, query),
  playlistContent: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_PLAYLIST_CONTENT, query),
  // profile prefs
  profileConsumeJudge: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_PROFILE_CONSUME_JUDGE, query),
  profilePreferenceOptions: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_PROFILE_PREFERENCE_OPTIONS, query),
  profilePreferenceSubmit: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_PROFILE_PREFERENCE_SUBMIT, body),
  // app config / tabs
  appConfig: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_APP_CONFIG, query),
  adConfig: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_AD_CONFIG, query),
  tabOperating: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_TAB_OPERATING, query),
  tabRankingList: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_TAB_RANKING_LIST, query),
  // search analytics / sniff / stats
  searchAnalyzeSeek: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_SEARCH_ANAYLZE_SEEK, body),
  sniffConfig: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_SNIFF_CONFIG, query),
  statisticsUserOperation: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_STATISTICS_USER_OPERATION, body),
  clientLogsRetrieveConfig: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_CLIENT_LOGS_RETRIEVE_CONFIG, query),
  retrieveClientLogsReport: (c, body = {}) => post(c, MISC.WEFEED_MOBILE_BFF_RETRIEVE_CLIENT_LOGS_REPORT, body),
  locationNearAddress: (c, query = {}) => get(c, MISC.WEFEED_MOBILE_BFF_LOCATION_NEAR_ADDRESS, query),
  // platform (hisavana / eagllwin) — absolute paths, different hosts
  cloudControlData: (c, body = {}) =>
    c.post(PLATFORM.HISAVANA_TRAFFIC_DISPATCH_V1_CONSUMER_NOT_LOGIN_CLOUDCONTROL_QUERY_GETCLOUDCONTROLDATA, body, { baseUrl: require('./config.cjs').HOSTS.cloudControl }),
  cloudControlDataOffline: (c, body = {}) =>
    c.post(PLATFORM.HISAVANA_TRAFFIC_DISPATCH_V1_CONSUMER_NOT_LOGIN_CLOUDCONTROL_QUERY_GETCLOUDCONTROLDATAOFFLINE, body, { baseUrl: require('./config.cjs').HOSTS.cloudControl }),
  adData: (c, body = {}) =>
    c.post(PLATFORM.HISAVANA_TRAFFIC_DISPATCH_V1_CONSUMER_NOT_LOGIN_ADDISPATCH_QUERY_GETADDATA, body, { baseUrl: require('./config.cjs').HOSTS.cloudControl }),
  submitClue: (c, body = {}) =>
    c.post(PLATFORM.EAGLLWIN_CLUE_CONSUMER_NOT_LOGIN_CLUE_CMD_SUBMITCLUE, body, { baseUrl: require('./config.cjs').HOSTS.eagllwin }),
  // wifi transfer (client/*)
  transferFilesList: (c, query = {}) => get(c, TRANSFER.CLIENT_GETTRANSFERFILESLIST, query),
  transferNotifyServerCreate: (c, body = {}) => post(c, TRANSFER.CLIENT_NOTIFYSERVERCREATE, body),
  transferNotifyFileTaskFinish: (c, body = {}) => post(c, TRANSFER.CLIENT_NOTIFYFILETASKFINISH, body),
  transferNotifyFileTaskError: (c, body = {}) => post(c, TRANSFER.CLIENT_NOTIFYFILETASKERROR, body),
  transferNotifyClientClose: (c, body = {}) => post(c, TRANSFER.CLIENT_NOTIFYCLIENTCLOSE, body),
  transferNotifyServerSendComplete: (c, body = {}) => post(c, TRANSFER.CLIENT_NOTIFYSERVERSENDCOMPLETE, body),
};
