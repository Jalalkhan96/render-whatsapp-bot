/**
 * TikTok adapter (id 74) — trending / INT
 * Transport: provider-required.
 * Probe (2026-10-05): GET https://www.tiktok.com/foryou returned HTTP 200 but
 * the body is a JS shell — __UNIVERSAL_DATA_FOR_REHYDRATION__ contained no
 * ItemModule and no video ids, and the environment script referenced captcha/
 * verify challenges. Datacenter IPs are blocked from receiving feed data. No
 * bypass attempted per batch rules.
 */
'use strict';

const PROVIDER_REQUIRED_REASON =
  'datacenter IP blocked; /foryou returns a JS shell with captcha markers and no video data in the rehydration JSON. Needs official API or a provider such as Apify.';

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
  const v = raw || {};
  return {
    source: 'tiktok',
    sourceUrl: v.url || null,
    category: 'trending',
    title: v.desc ? v.desc.slice(0, 140) : null,
    description: v.desc || null,
    content: v.desc || null,
    url: v.url || null,
    image: v.cover || null,
    author: v.author || null,
    publishedAt: v.publishedAt || null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: v.tags || [],
    metadata: {
      score: typeof v.likes === 'number' ? v.likes : null,
      comments: typeof v.comments === 'number' ? v.comments : null,
      engagement: [v.likes, v.comments, v.shares].filter((n) => typeof n === 'number').reduce((a, b) => a + b, 0) || null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

function blocked() {
  throw new Error(`provider-required: ${PROVIDER_REQUIRED_REASON}`);
}

module.exports = {
  id: 'tiktok',
  name: 'TikTok',
  country: 'INT',
  category: 'trending',
  baseUrl: 'https://www.tiktok.com/',
  language: 'en',
  enabled: true,
  priority: 74,
  transport: 'provider-required',
  providerRequiredReason: PROVIDER_REQUIRED_REASON,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    // Attempted 2026-10-05; returns JS shell with no feed data from datacenter IP.
    foryou: 'https://www.tiktok.com/foryou',
    discover: 'https://www.tiktok.com/discover?lang=en',
  },
  selectors: {},
  schedule: { frequency: 'medium' },
  async latest() { return blocked(); },
  async search() { return blocked(); },
  async scrape() { return blocked(); },
  normalize,
  _fetchText: fetchText,
};
