'use strict';
/* Pakistan Meteorological Department (weather.gov.pk) — PROVIDER REQUIRED.
 * Verified 2026-10-05:
 *  - weather.gov.pk (homepage and /nwfc/daily-forecast) returns HTTP 403 with
 *    a Cloudflare bot-mitigation challenge (`cf-mitigated: challenge`).
 *  - PMD's own official landing domain pmd.gov.pk (reachable, HTTP 200)
 *    explicitly states: "Our live forecasts, warnings and advisories now
 *    publish at weather.gov.pk" — and carries no live figures itself.
 * No forecast/alert values can be extracted without bypassing the challenge,
 * and weather values must never be invented. A live-browser or provider
 * session that can pass the Cloudflare check is required.
 */
const cheerio = require('cheerio'); // kept for contract parity; unused while provider-required

const REASON = 'Cloudflare bot-mitigation challenge (HTTP 403, cf-mitigated: challenge) on weather.gov.pk, including /nwfc/daily-forecast; PMD\'s own pmd.gov.pk states live forecasts/alerts publish only at weather.gov.pk and carries no live figures. No values extractable without bypassing the challenge, and weather values must never be invented.';

module.exports = {
  id: 'weather-gov',
  name: 'Pakistan Meteorological Dept',
  country: 'PK',
  category: 'weather',
  baseUrl: 'https://weather.gov.pk/',
  language: 'en',
  enabled: true,
  priority: 26,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: { latest: 'https://weather.gov.pk/nwfc/daily-forecast', search: null },
  selectors: { list: [], title: [], link: [], image: [], date: [] },
  schedule: { frequency: 'high' },

  async latest(/* opts = {} */) { return []; },
  async search(/* query, opts = {} */) { return { supported: false, reason: REASON }; },
  async scrape(/* url, opts = {} */) { return null; },
  normalize(raw) { return raw; },
};
