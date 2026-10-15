// PCB (Pakistan Cricket Board) — fixtures/results/news scraper
// STATUS: provider-required (verified live 2026-10-05).
// https://www.pcb.com.pk/ (and /wp-json/ paths) return HTTP 403 / connection
// failures via Cloudflare to automated clients. No public fixtures/news
// endpoint is reachable without bypassing the challenge, which this system never does.
const cheerio = require('cheerio');

const REASON = 'pcb.com.pk is Cloudflare-guarded: the homepage and API paths return HTTP 403 / blocked responses to automated clients, so no public fixtures, results or news endpoint is reachable without bypassing the challenge, which this system never does.';

async function latest() { return []; }
async function search() { return []; }
async function scrape() { return null; }

function normalize(raw) {
  return {
    source: 'pcb',
    category: 'cricket',
    title: raw.title || null,
    event: raw.event || null,
    team1: raw.team1 || null,
    team2: raw.team2 || null,
    score: raw.score || null,
    status: raw.status || null,
    venue: raw.venue || null,
    startTime: raw.startTime || null,
    url: raw.url || null,
    metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'pcb',
  name: 'PCB',
  country: 'PK',
  category: 'cricket',
  baseUrl: 'https://www.pcb.com.pk/',
  language: 'en',
  enabled: true,
  priority: 44,
  transport: 'provider-required',
  providerRequiredReason: REASON,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {},
  selectors: {},
  schedule: { frequency: 'high' },
  latest,
  search,
  scrape,
  normalize,
};
