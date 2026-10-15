'use strict';
/** Auth & user — /wefeed-mobile-bff/user-api/* */
const { USER } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: USER,
  /** Login. body: { account, password, ... } — exact fields are app-defined. Returns token; feed it to client.setToken(). */
  login: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_LOGIN, body),
  /** Third-party login. body: { type, openId/token, ... } */
  thirdLogin: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_THIRD_LOGIN, body),
  register: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_REGISTER, body),
  logout: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_LOGOUT, body),
  /** Current user info (needs token). */
  info: (c) => get(c, USER.WEFEED_MOBILE_BFF_USER_API_INFO),
  profile: (c, query = {}) => get(c, USER.WEFEED_MOBILE_BFF_USER_API_PROFILE, query),
  profileV3: (c, query = {}) => get(c, USER.WEFEED_MOBILE_BFF_USER_API_PROFILE_V3, query),
  modify: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_MODIFY, body),
  /** SMS code flow. */
  getSmsCode: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_GET_SMS_CODE, body),
  checkSmsCode: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_CHECK_SMS_CODE, body),
  checkPhoneAccount: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_CHECK_PHONE_ACCOUNT, body),
  checkMailAccount: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_CHECK_MAIL_ACCOUNT, body),
  resetPassword: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_RESET_PASSWORD, body),
  block: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_BLOCK, body),
  unblock: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_UNBLOCK, body),
  submitPrefer: (c, body = {}) => post(c, USER.WEFEED_MOBILE_BFF_USER_API_SUBMIT_PREFER, body),
};
