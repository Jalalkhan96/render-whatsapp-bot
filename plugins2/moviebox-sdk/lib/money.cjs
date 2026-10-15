'use strict';
/** Money / VIP / rewards / activities — /wefeed-mobile-bff/{money,vip,activity}/* + /open-api/payment/* */
const { MONEY } = require('./config.cjs');

const get = (c, path, query) => c.get(path, { query });
const post = (c, path, body, query) => c.post(path, body, { query });

module.exports = {
  PATHS: MONEY,
  // store / orders
  skuList: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_MONEY_SKU_LIST_GET, query),
  gpTradingOrderCreate: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_MONEY_GP_TRADING_ORDER_CREATE, body),
  gpPurchaseResultPolling: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_MONEY_GP_PURCHASE_RESULT_POLLING, query),
  paynicornTradingOrderCreate: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_MONEY_PAYNICORN_TRADING_ORDER_CREATE, body),
  paynicornPurchaseResultPolling: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_MONEY_PAYNICORN_PURCHASE_RESULT_POLLING, query),
  paynicornOrder: (c, body = {}) => post(c, MONEY.OPEN_API_PAYMENT_ORDER_PAYNICORN, body),
  coinLog: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_MONEY_COIN_LOG, query),
  exchangeOrder: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_MONEY_EXCHANGE_ORDER, body),
  // vip
  vipRightsCheck: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_VIP_MEMBER_RIGHTS_CHECK, query),
  vipRewardsReceive: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_VIP_MEMBER_REWARDS_RECEIVE, body),
  // activities / rewards
  activityEntrance: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_ENTRANCE, query),
  activityTaskList: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_TASK_LIST, query),
  activityCheckIn: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_CHECK_IN, body),
  activityRewardsReceive: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_REWARDS_RECEIVE, body),
  activityWelfareCenter: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_WELFARE_CENTER, query),
  activityDownloadTaskReceive: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_DOWNLOAD_TASK_RECEIVE, body),
  activityPromoCodeBind: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_PROMO_CODE_BIND, body),
  activityFissionBind: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_FISSION_BIND, body),
  activityFissionRewardList: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_FISSION_REWARD_LIST, query),
  activityAdDadaSetDefault: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_AD_DADA_SET_DEFAULT, body),
  lotteryDraw: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_LOTTERY_DRAW, body),
  lotteryDrawCodeRedeem: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_LOTTERY_DRAW_CODE_REDEEM, body),
  lotteryPrizeClaim: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_LOTTERY_PRIZE_CLAIM, body),
  lotteryPrizeRedeem: (c, body = {}) => post(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_LOTTERY_PRIZE_REDEEM, body),
  lotteryUserActivityInfo: (c, query = {}) => get(c, MONEY.WEFEED_MOBILE_BFF_ACTIVITY_LOTTERY_USER_ACTIVITY_INFO, query),
};
