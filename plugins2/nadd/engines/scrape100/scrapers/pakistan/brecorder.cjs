'use strict';
/* Business Recorder (brecorder.com) — PROVIDER REQUIRED.
 * Verified 2026-10-05: Cloudflare bot-mitigation challenge blocks every HTTP
 * request. Homepage TCP connection is terminated at the edge; /feed/ returns
 * HTTP 403 with header `cf-mitigated: challenge`. Solving the challenge would
 * mean bypassing an anti-bot gate, which is out of scope. No data extractable.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Cloudflare bot-mitigation challenge blocks all HTTP access: the homepage connection is terminated at the edge and /feed/ returns HTTP 403 with `cf-mitigated: challenge`. The challenge cannot be solved without bypassing anti-bot protection, so no public content is extractable.';

module.exports = {
  id: 'brecorder',
  name: 'Business Recorder',
  country: 'PK',
  category: 'business',
  baseUrl: 'https://www.brecorder.com/',
  language: 'en',
  enabled: true,
  priority: 15,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://www.brecorder.com/', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'high' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
