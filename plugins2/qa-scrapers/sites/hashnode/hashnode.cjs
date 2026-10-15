'use strict';
/**
 * hashnode.cjs — Hashnode stories scraper (Group C, site 2/4).
 *
 * Uses the public Hashnode GraphQL endpoint (no API key):
 *   POST https://gql.hashnode.com/  { query: "query { storiesFeed(first: N) { ... } }" }
 *
 * ⚠️  LIVE STATUS (verified 2026-10-03): gql.hashnode.com now 301-redirects to
 *     https://hashnode.com/changelog/2026-05-13-graphql-api-paid-access —
 *     "GraphQL API is moving to a paid offering". The no-key public endpoint
 *     is effectively DEAD. This scraper still implements the full query +
 *     parsing (and tries the `feed` query as a fallback) so it works again if
 *     Hashnode reopens public access — but right now it throws an honest
 *     error instead of returning fake items.
 *
 * Usage:
 *   node hashnode.cjs --limit 10 --out out.json [--format json|csv]
 */

const UA = 'qa-scrapers/1.0';
const ENDPOINT = 'https://gql.hashnode.com/';
const PAID_MSG =
  'Hashnode GraphQL API now requires paid access (gql.hashnode.com redirects to ' +
  'hashnode.com/changelog/2026-05-13-graphql-api-paid-access since 2026-05-13). ' +
  'No public no-key endpoint is available.';

const NODE_FIELDS = 'title brief url author { username name } tags { name } reactionCount responseCount';

async function gql(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok || /^\s*</.test(text)) {
    // HTML body (or redirect landing page) = endpoint gone / paywalled
    throw new Error(res.ok ? PAID_MSG : `hashnode GraphQL returned HTTP ${res.status}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('hashnode GraphQL returned non-JSON (endpoint likely paywalled): ' + PAID_MSG);
  }
  return json;
}

function toItems(edges) {
  return (edges || [])
    .map((e) => e && e.node)
    .filter(Boolean)
    .map((n) => ({
      title: n.title || null,
      brief: n.brief || null,
      url: n.url || null,
      author: (n.author && (n.author.username || n.author.name)) || null,
      tags: Array.isArray(n.tags) ? n.tags.map((t) => t.name || t.slug).filter(Boolean).join(', ') : null,
      reactions: n.reactionCount != null ? n.reactionCount : null,
      responses: n.responseCount != null ? n.responseCount : null,
    }));
}

async function scrape(opts = {}) {
  const limit = Math.max(1, parseInt(opts.limit || '10', 10) || 10);

  // Attempt 1: storiesFeed (field names verified against Hashnode docs)
  let json = await gql(`query { storiesFeed(first: ${limit}) { edges { node { ${NODE_FIELDS} } } } }`);

  // Attempt 2: if the schema rejects storiesFeed, try the `feed` field
  if (json.errors && /storiesFeed/i.test(JSON.stringify(json.errors))) {
    json = await gql(`query { feed(first: ${limit}) { edges { node { ${NODE_FIELDS} } } } } }`);
  }
  if (json.errors) {
    throw new Error('hashnode GraphQL errors: ' + JSON.stringify(json.errors).slice(0, 300));
  }

  const edges =
    (json.data && (json.data.storiesFeed || json.data.feed) && (json.data.storiesFeed || json.data.feed).edges) || [];
  const items = toItems(edges).slice(0, limit);
  if (!items.length) {
    throw new Error('hashnode returned no parseable story items — schema likely changed or access restricted');
  }
  return { total: items.length, items };
}

module.exports = { scrape };

/* ---------------- CLI ---------------- */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      o[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    }
  }
  return o;
}

function toCsv(items) {
  const cols = ['title', 'brief', 'url', 'author', 'tags', 'reactions', 'responses'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = String(args.format || 'json').toLowerCase();
    try {
      const { items, total } = await scrape({ limit: args.limit });
      const out = format === 'csv' ? toCsv(items) : JSON.stringify({ total, items }, null, 2);
      if (args.out) {
        require('fs').writeFileSync(String(args.out), out);
        console.log(`wrote ${total} stories -> ${args.out}`);
      } else {
        process.stdout.write(out);
      }
    } catch (e) {
      console.error('error:', e.message);
      process.exit(1);
    }
  })();
}
