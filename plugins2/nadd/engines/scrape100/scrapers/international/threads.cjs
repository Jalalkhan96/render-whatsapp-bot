/**
 * Threads adapter (id 77) — social / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.threads.net/ returned HTTP 200 but the
 * body is the login shell (login markers, no post data). All post/feed content
 * requires an authenticated session. No bypass attempted per batch rules.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'login wall; homepage returns the login shell (HTTP 200) with no public post data. Needs official API or a provider such as Apify.';

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
  const t = raw || {};
  return {
    source: 'threads',
    sourceUrl: t.url || null,
    category: 'social',
    title: t.text ? t.text.slice(0, 140) : null,
    description: t.text || null,
    content: t.text || null,
    url: t.url || null,
    image: t.image || null,
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
  id: 'threads',
  name: 'Threads',
  country: 'INT',
  category: 'social',
  baseUrl: 'https://www.threads.net/',
  language: 'en',
  enabled: true,
  priority: 77,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; returns login shell. Reference only.
    home: 'https://www.threads.net/',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
