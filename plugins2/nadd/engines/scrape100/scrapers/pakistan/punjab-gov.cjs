'use strict';
/* Punjab Government portal (punjab.gov.pk) — PROVIDER REQUIRED.
 * Verified 2026-10-05: the site is unreachable from this network. DNS for
 * punjab.gov.pk resolves to the 198.18.0.0/15 benchmarking range (a sinkhole)
 * and every connection attempt fails or times out, for both the bare and www
 * hosts, over http and https, with 35s timeouts and retries.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Site unreachable from this network: DNS for punjab.gov.pk resolves to the 198.18.0.0/15 benchmarking range (sinkholed) and all connection attempts fail or time out (bare + www hosts, http/https, retries exhausted).';

module.exports = {
  id: 'punjab-gov',
  name: 'Punjab Government',
  country: 'PK',
  category: 'government',
  baseUrl: 'https://punjab.gov.pk/',
  language: 'en',
  enabled: true,
  priority: 22,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://punjab.gov.pk/', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'medium' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
