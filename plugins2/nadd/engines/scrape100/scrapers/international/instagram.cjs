/**
 * Instagram adapter (id 73) — social / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.instagram.com/instagram/ returned HTTP 200
 * but the body is the logged-out shell (generic <title>Instagram</title>, no
 * profile data, no shortcode/media JSON). Post/profile pages carry no public
 * data without login. Per batch rules only public endpoints were tried; no
 * bypass attempted.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'login wall; public profile pages return the logged-out shell (HTTP 200) with no post/profile JSON. Needs official API or a provider such as Apify.';

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
    source: 'instagram',
    sourceUrl: p.url || null,
    category: 'social',
    title: p.caption ? p.caption.slice(0, 140) : null,
    description: p.caption || null,
    content: p.caption || null,
    url: p.url || null,
    image: p.image || null,
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
  id: 'instagram',
  name: 'Instagram',
  country: 'INT',
  category: 'social',
  baseUrl: 'https://www.instagram.com/',
  language: 'en',
  enabled: true,
  priority: 73,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; returned logged-out shell with no data. Reference only.
    profile: 'https://www.instagram.com/{username}/',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
