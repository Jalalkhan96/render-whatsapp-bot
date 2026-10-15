// Airblue — public routes/schedules/announcements scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.airblue.com/ returns HTTP 403 with a Cloudflare "Just a moment..."
// challenge page to automated clients. No public routes/schedule endpoint is
// reachable without bypassing the challenge, which this system never does.
const cheerio = require('cheerio');

const REASON = 'airblue.com returns a Cloudflare "Just a moment..." challenge (HTTP 403) to automated clients; no public routes/schedules endpoint is reachable without bypassing it, which this system never does.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'airblue', category: 'flights',
    title: raw.title || null, event: raw.event || null,
    team1: null, team2: null, score: raw.score || null, status: raw.status || null,
    venue: raw.venue || null, startTime: raw.startTime || null,
    url: raw.url || null, metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'airblue',
  name: 'Airblue',
  country: 'PK',
  category: 'flights',
  baseUrl: 'https://www.airblue.com/',
  language: 'en',
  enabled: true,
  priority: 39,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {},
  selectors: {},
  schedule: { frequency: 'low' },
  latest,
  search,
  scrape,
  normalize,
};
