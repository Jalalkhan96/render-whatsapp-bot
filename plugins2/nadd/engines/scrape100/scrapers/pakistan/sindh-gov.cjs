'use strict';
/* Sindh Government portal (sindh.gov.pk) — PROVIDER REQUIRED.
 * Verified 2026-10-05: the site is unreachable from this network. DNS for
 * sindh.gov.pk resolves to the 198.18.0.0/15 benchmarking range (a sinkhole)
 * and every request — homepage and /feed/, bare and www hosts — aborts after
 * repeated 35–45s timeouts, retries exhausted.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Site unreachable from this network: DNS for sindh.gov.pk resolves to the 198.18.0.0/15 benchmarking range (sinkholed); homepage and /feed/ requests abort after repeated 35–45s timeouts (bare + www hosts, retries exhausted).';

module.exports = {
  id: 'sindh-gov',
  name: 'Sindh Government',
  country: 'PK',
  category: 'government',
  baseUrl: 'https://sindh.gov.pk/',
  language: 'en',
  enabled: true,
  priority: 24,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://sindh.gov.pk/', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'medium' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
