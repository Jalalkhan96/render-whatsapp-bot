'use strict';
/**
 * moviebox-api-sdk — MovieBox+ (com.community.oneroom) API client, zero dependencies.
 *
 * const { MovieBoxClient, subject, user, ugc } = require('moviebox-api-sdk');
 * const client = new MovieBoxClient({ env: 'prod' });
 * const results = await subject.search(client, { keyword: 'dune', page: 1 });
 */
const { MovieBoxClient, HOSTS } = require('./lib/client.cjs');
const config = require('./lib/config.cjs');
const subject = require('./lib/subject.cjs');
const ugc = require('./lib/ugc.cjs');
const user = require('./lib/user.cjs');
const shorts = require('./lib/shorts.cjs');
const community = require('./lib/community.cjs');
const money = require('./lib/money.cjs');
const misc = require('./lib/misc.cjs');
const delivery = require('./lib/delivery.cjs');

module.exports = {
  MovieBoxClient,
  HOSTS,
  endpoints: config, // every endpoint path constant, grouped
  subject,
  ugc,
  user,
  shorts,
  community,
  money,
  misc,
  delivery,
};
