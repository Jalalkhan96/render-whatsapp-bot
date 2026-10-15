/**
 * X (Twitter) adapter (id 72) — social / INT
 * Transport: provider-required.
 * Probe (2026-10-05): public search page https://x.com/search?q=test returned HTTP
 * 307 redirecting to the login wall; the legacy syndication endpoint
 * cdn.syndication.twimg.com/timeline/profile returned 200 with an EMPTY body
 * (dead); publish.twitter.com/oembed returned 301 (retired). No public
 * timeline/search/trending endpoint is usable without login. Per batch rules no
 * bypass was attempted.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'login wall + anti-bot; public search redirects to login (HTTP 307), legacy syndication endpoints are dead (200 with empty body / retired). Needs official API or Apify actor.';

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
  const t = raw || {};
  return {
    source: 'x',
    sourceUrl: t.url || null,
    category: 'social',
    title: t.text ? t.text.slice(0, 140) : null,
    description: t.text || null,
    content: t.text || null,
    url: t.url || null,
    image: null,
    author: t.author || null,
    publishedAt: t.publishedAt || null,
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
  id: 'x',
  name: 'X',
  country: 'INT',
  category: 'social',
  baseUrl: 'https://x.com/',
  language: 'en',
  enabled: true,
  priority: 72,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; all public routes login-walled or dead. Reference only.
    search: 'https://x.com/search?q={query}',
    syndicationTweet: 'https://cdn.syndication.twimg.com/tweet-result?id={id}&lang=en',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
