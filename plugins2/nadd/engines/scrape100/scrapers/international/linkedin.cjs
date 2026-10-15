/**
 * LinkedIn adapter (id 78) — social / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.linkedin.com/feed/ returned HTTP 302
 * redirecting to the auth/login flow. LinkedIn has aggressive anti-bot and no
 * genuinely public feed/search/post endpoints. No bypass attempted per batch rules.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'auth/anti-bot; /feed/ returns HTTP 302 to the login flow; no genuinely public content endpoint. Needs official API or a provider such as Apify.';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'manual' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

function normalize(raw) {
  const p = raw || {};
  return {
    source: 'linkedin',
    sourceUrl: p.url || null,
    category: 'social',
    title: p.text ? p.text.slice(0, 140) : null,
    description: p.text || null,
    content: p.text || null,
    url: p.url || null,
    image: null,
    author: p.author || null,
    publishedAt: p.publishedAt || null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: [],
    metadata: { score: null, comments: null, engagement: null },
    scrapedAt: new Date().toISOString(),
  };
}

function blocked() {
  throw new Error(`provider-required: ${PROVIDER_REQUIRED_REASON}`);
}

module.exports = {
  id: 'linkedin',
  name: 'LinkedIn',
  country: 'INT',
  category: 'social',
  baseUrl: 'https://www.linkedin.com/',
  language: 'en',
  enabled: true,
  priority: 78,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; 302 to auth. Reference only.
    feed: 'https://www.linkedin.com/feed/',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
