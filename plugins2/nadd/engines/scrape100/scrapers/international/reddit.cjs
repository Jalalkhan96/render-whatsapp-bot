/**
 * Reddit adapter (id 71) — social / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.reddit.com/r/all/hot.json?limit=5 with a
 * browser UA returned HTTP 403 (Reddit block page, datacenter IP). The search
 * endpoint /search.json?q=... also returned 403. No retry was attempted against
 * the block per batch rules. Reddit requires OAuth (official API) or a provider
 * for programmatic access from datacenter IPs.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'Public JSON endpoints (/r/all/hot.json, /search.json) returned HTTP 403 from a datacenter IP; ' +
  'Reddit blocks unauthenticated datacenter traffic. Needs official Reddit API (OAuth) or a provider such as Apify.';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

function normalize(raw) {
  const d = raw && raw.data ? raw.data : raw || {};
  return {
    source: 'reddit',
    sourceUrl: `https://www.reddit.com${d.permalink || ''}`,
    category: 'social',
    title: d.title || null,
    description: d.selftext && d.selftext.length > 0 ? d.selftext.slice(0, 500) : null,
    content: d.selftext || null,
    url: d.url || `https://www.reddit.com${d.permalink || ''}`,
    image: d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : null,
    author: d.author || null,
    publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: d.subreddit ? [d.subreddit] : [],
    metadata: {
      score: typeof d.score === 'number' ? d.score : null,
      comments: typeof d.num_comments === 'number' ? d.num_comments : null,
      engagement: (typeof d.score === 'number' ? d.score : 0) + (typeof d.num_comments === 'number' ? d.num_comments : 0),
    },
    scrapedAt: new Date().toISOString(),
  };
}

function blocked() {
  throw new Error(`provider-required: ${PROVIDER_REQUIRED_REASON}`);
}

module.exports = {
  id: 'reddit',
  name: 'Reddit',
  country: 'INT',
  category: 'social',
  baseUrl: 'https://www.reddit.com/',
  language: 'en',
  enabled: true,
  priority: 71,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05, both returned HTTP 403 from datacenter IP. Kept for
    // reference if run with residential IP or OAuth credentials in future.
    hot: 'https://www.reddit.com/r/{sub}/hot.json',
    allHot: 'https://www.reddit.com/r/all/hot.json',
    search: 'https://www.reddit.com/search.json?q={query}&type=link',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  // exported for diagnostics only
  _fetchText: fetchText,
};
