'use strict';
/* Social provider adapters (MASTER PROMPT §29). Each provider documents its
 * access strategy in priority order and delegates to the matching site adapter.
 * Strategies: official API > approved provider (e.g. Apify actor) > public endpoint.
 * Secrets (API keys, Apify tokens) come ONLY from env — never hard-coded. */

function load(id) {
  try { return require(`../scrapers/international/${id}.cjs`); }
  catch (err) { return { _missing: true, _error: err.message }; }
}

const PROVIDERS = {
  reddit: {
    name: 'Reddit', id: 'reddit',
    strategies: [
      { kind: 'public-endpoint', detail: 'public JSON endpoints (/.json, /r/<sub>/hot.json) — no key' },
      { kind: 'official-api', detail: 'Reddit API with OAuth (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
    ],
  },
  x: {
    name: 'X', id: 'x',
    strategies: [
      { kind: 'official-api', detail: 'X API v2 (X_BEARER_TOKEN env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
      { kind: 'public-endpoint', detail: 'public syndication endpoints where available' },
    ],
  },
  instagram: {
    name: 'Instagram', id: 'instagram',
    strategies: [
      { kind: 'official-api', detail: 'Instagram Graph API (META_APP_ID / META_APP_SECRET env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
      { kind: 'public-endpoint', detail: 'public post/reel page embeds where not login-walled' },
    ],
  },
  tiktok: {
    name: 'TikTok', id: 'tiktok',
    strategies: [
      { kind: 'official-api', detail: 'TikTok Research/Display API (TIKTOK_CLIENT_KEY env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
      { kind: 'public-endpoint', detail: 'public page data where not blocked' },
    ],
  },
  youtube: {
    name: 'YouTube', id: 'youtube',
    strategies: [
      { kind: 'official-api', detail: 'YouTube Data API v3 (YOUTUBE_API_KEY env)' },
      { kind: 'public-endpoint', detail: 'public RSS feeds + page data (no key)' },
    ],
  },
  pinterest: {
    name: 'Pinterest', id: 'pinterest',
    strategies: [
      { kind: 'official-api', detail: 'Pinterest API v5 (PINTEREST_ACCESS_TOKEN env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
      { kind: 'public-endpoint', detail: 'public endpoints where not login-walled' },
    ],
  },
  threads: {
    name: 'Threads', id: 'threads',
    strategies: [
      { kind: 'official-api', detail: 'Threads API (META_APP_ID / THREADS_ACCESS_TOKEN env)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
    ],
  },
  linkedin: {
    name: 'LinkedIn', id: 'linkedin',
    strategies: [
      { kind: 'official-api', detail: 'LinkedIn API (LINKEDIN_ACCESS_TOKEN env, company pages only)' },
      { kind: 'apify', detail: 'Apify actor (APIFY_TOKEN env)' },
    ],
    note: 'Never bypass authentication or anti-bot controls. Public company info only.',
  },
};

function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown provider: ${name}`);
  const adapter = load(p.id);
  return { ...p, adapter, adapterMissing: !!adapter._missing };
}

function listProviders() { return Object.keys(PROVIDERS); }

module.exports = { PROVIDERS, getProvider, listProviders };
