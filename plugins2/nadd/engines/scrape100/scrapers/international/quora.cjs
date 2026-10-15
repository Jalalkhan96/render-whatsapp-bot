/**
 * Quora adapter (id 79) — community / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.quora.com/topic/Technology returned HTTP
 * 403 (anti-bot) from the datacenter IP with a browser UA. Public question/topic
 * pages are not retrievable. No bypass attempted per batch rules.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'anti-bot; public topic page returned HTTP 403 from datacenter IP; no public data endpoint. Needs official API or a provider such as Apify.';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

function normalize(raw) {
  const q = raw || {};
  return {
    source: 'quora',
    sourceUrl: q.url || null,
    category: 'community',
    title: q.title || null,
    description: q.excerpt || null,
    content: q.content || null,
    url: q.url || null,
    image: null,
    author: q.author || null,
    publishedAt: q.publishedAt || null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: q.tags || [],
    metadata: {
      score: typeof q.upvotes === 'number' ? q.upvotes : null,
      comments: typeof q.answers === 'number' ? q.answers : null,
      engagement: null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

function blocked() {
  throw new Error(`provider-required: ${PROVIDER_REQUIRED_REASON}`);
}

module.exports = {
  id: 'quora',
  name: 'Quora',
  country: 'INT',
  category: 'community',
  baseUrl: 'https://www.quora.com/',
  language: 'en',
  enabled: true,
  priority: 79,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; 403 anti-bot. Reference only.
    topic: 'https://www.quora.com/topic/{topic}',
    search: 'https://www.quora.com/search?q={query}',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
