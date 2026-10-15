'use strict';
/** Community: posts, groups, subscriptions, likes — /wefeed-mobile-bff/{post,group,community,subscription,interactive}/* */
const { COMMUNITY } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: COMMUNITY,
  // posts
  postCreate: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_CREATE, body),
  postGet: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_GET, query),
  postDelete: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_DELETE, body),
  postListGroup: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_LIST_GROUP, query),
  postListLikes: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_LIST_LIKES, query),
  postListSubject: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_LIST_SUBJECT, query),
  postListUser: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_LIST_USER, query),
  postListUserMy: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_POST_LIST_USER_MY, query),
  postLike: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_INTERACTIVE_POST_LIKE, body),
  ugcVideoLike: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_INTERACTIVE_UGC_VIDEO_LIKE, body),
  // groups
  groupCreate: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_CREATE, body),
  groupGet: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_GET, query),
  groupJoin: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_JOIN, body),
  groupLeave: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LEAVE, body),
  groupUpdate: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_UPDATE, body),
  groupVisit: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_VISIT, body),
  groupRank: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_RANK, query),
  groupExist: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_EXIST, query),
  groupListClass: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_CLASS, query),
  groupListCommunityEntrance: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_COMMUNITY_ENTRANCE, query),
  groupListMyV2: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_MY_V2, query),
  groupListSearch: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_SEARCH, query),
  groupListSubject: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_SUBJECT, query),
  groupListUser: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_GROUP_LIST_USER, query),
  // community tabs + subscriptions
  communityTab: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_COMMUNITY_TAB, query),
  communityTrendingEntrance: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_COMMUNITY_TRENDING_ENTRANCE, query),
  subscriptionFeed: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_SUBSCRIPTION_FEED, query),
  subscriptionStats: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_SUBSCRIPTION_STATS, query),
  subscriptionStatus: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_SUBSCRIPTION_STATUS, query),
  subscriptionSubscribe: (c, body = {}) => post(c, COMMUNITY.WEFEED_MOBILE_BFF_SUBSCRIPTION_SUBSCRIPTION, body),
  subscriptionFollowingsV1: (c, query = {}) => get(c, COMMUNITY.WEFEED_MOBILE_BFF_SUBSCRIPTION_V1_FOLLOWINGS, query),
};
