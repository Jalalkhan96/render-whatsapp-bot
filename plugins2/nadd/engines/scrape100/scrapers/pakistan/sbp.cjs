'use strict';
/* State Bank of Pakistan (sbp.org.pk) — PROVIDER REQUIRED.
 * Verified 2026-10-05: every page — including the homepage and the
 * exchange-rate endpoint /ecodata/forex.asp — returns HTTP 403 with a
 * Cloudflare "Attention Required!" JS-challenge page. The challenge cannot be
 * solved without bypassing anti-bot protection, so no public market/economic
 * data (exchange rates, circulars, announcements) is extractable.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Cloudflare "Attention Required!" JS challenge returns HTTP 403 for all pages, including the public exchange-rate endpoint /ecodata/forex.asp. The challenge cannot be solved without bypassing anti-bot protection, so no SBP data is extractable.';

module.exports = {
  id: 'sbp',
  name: 'State Bank of Pakistan',
  country: 'PK',
  category: 'economy',
  baseUrl: 'https://www.sbp.org.pk/',
  language: 'en',
  enabled: true,
  priority: 18,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://www.sbp.org.pk/', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'high' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
