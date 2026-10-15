'use strict';
/* NADRA (nadra.gov.pk) — PROVIDER REQUIRED.
 * Verified 2026-10-05: the Akamai edge returns "Access Denied"
 * (errors.edgesuite.net reference page, HTTP 403) for every request from this
 * network — a datacenter/IP block. No public notices are reachable.
 * Per policy, only public notices would ever be collected — never citizen data.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Akamai edge returns "Access Denied" (HTTP 403, errors.edgesuite.net) for all requests from this network — an IP/datacenter block. No public NADRA notices are reachable.';

module.exports = {
  id: 'nadra',
  name: 'NADRA',
  country: 'PK',
  category: 'government',
  baseUrl: 'https://www.nadra.gov.pk/',
  language: 'en',
  enabled: true,
  priority: 20,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://www.nadra.gov.pk/', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'medium' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
