/**
 * Pinterest adapter (id 76) — trending / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.pinterest.com/ returned HTTP 200 but the
 * body is the logged-out JS shell — 63 "unauth" markers, zero pin ids, zero
 * grid/resource data. Pinterest renders content only after JS execution behind
 * login; its v3/resource APIs require auth. No bypass attempted per batch rules.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'login wall; homepage returns a logged-out unauth JS shell (HTTP 200) with no pin data; resource APIs require auth. Needs official API or a provider such as Apify.';

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
  const p = raw || {};
  return {
    source: 'pinterest',
    sourceUrl: p.url || null,
    category: 'trending',
    title: p.title || null,
    description: p.description || null,
    content: p.description || null,
    url: p.url || null,
    image: p.image || null,
    author: p.author || null,
    publishedAt: null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: p.tags || [],
    metadata: { score: null, comments: null, engagement: null },
    scrapedAt: new Date().toISOString(),
  };
}

function blocked() {
  throw new Error(`provider-required: ${PROVIDER_REQUIRED_REASON}`);
}

module.exports = {
  id: 'pinterest',
  name: 'Pinterest',
  country: 'INT',
  category: 'trending',
  baseUrl: 'https://www.pinterest.com/',
  language: 'en',
  enabled: true,
  priority: 76,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; returns logged-out shell with no data. Reference only.
    home: 'https://www.pinterest.com/',
    search: 'https://www.pinterest.com/search/pins/?q={query}',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
