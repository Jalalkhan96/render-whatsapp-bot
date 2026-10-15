'use strict';
/**
 * medium.cjs — Medium tag-stream scraper (Group C, site 4/4). BEST-EFFORT.
 *
 * Uses Medium's internal JSON endpoint (no key):
 *   GET https://medium.com/_/api/tags/{tag}/stream
 * then strips the anti-XSSI prefix `])}while(1);</x>` and JSON.parses the body.
 *
 * ⚠️  LIVE STATUS (verified 2026-10-03): the endpoint returns HTTP 200 with
 *     valid XSSI-stripped JSON, but `payload.streamItems` is EMPTY and
 *     `payload.references` is EMPTY (`latest`/`top` variants are 404) —
 *     Medium has effectively emptied this internal endpoint. The parser below
 *     handles the historically-known shapes (payload.references.Post/User and
 *     common variants) and throws an honest error when nothing parseable is
 *     found. Marking best-effort: do not expect live post data from this
 *     endpoint right now.
 *
 * Usage:
 *   node medium.cjs --tag javascript --limit 10 --out out.json [--format json|csv]
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const XSSI = /^\]\)\}while\(1\);<\/x>/;

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPosts(json) {
  const posts = [];
  const refs = (json.payload && json.payload.references) || json.references || {};
  const postMap = refs.Post || {};

  for (const id of Object.keys(postMap)) {
    const p = postMap[id] || {};
    const creatorId = p.creatorId || (p.creator && p.creator.userId);
    const user = (refs.User && creatorId && refs.User[creatorId]) || {};
    posts.push({
      title: p.title || null,
      subtitle: stripTags(p.content && p.content.subtitle) || null,
      url: p.mediumUrl || `https://medium.com/p/${id.replace(/^post:/, '')}`,
      author: user.name || user.username || null,
      claps: p.virtuals && p.virtuals.totalClapCount != null ? p.virtuals.totalClapCount : null,
      published_at:
        p.firstPublishedAt != null ? new Date(p.firstPublishedAt).toISOString() : null,
    });
  }

  // Variant: flat post list under payload
  if (!posts.length) {
    const flat =
      (json.payload && (json.payload.posts || json.payload.value)) ||
      json.posts ||
      json.value ||
      [];
    const arr = Array.isArray(flat) ? flat : Object.values(flat);
    for (const p of arr) {
      if (!p || typeof p !== 'object' || !p.title) continue;
      posts.push({
        title: p.title || null,
        subtitle: stripTags(p.subtitle) || null,
        url: p.mediumUrl || p.url || null,
        author: (p.author && (p.author.name || p.author.username)) || p.authorName || null,
        claps: p.totalClapCount != null ? p.totalClapCount : null,
        published_at: p.firstPublishedAt != null ? new Date(p.firstPublishedAt).toISOString() : null,
      });
    }
  }
  return posts.filter((p) => p.title);
}

async function scrape(opts = {}) {
  const tag = String(opts.tag || 'javascript').trim().toLowerCase() || 'javascript';
  const limit = Math.max(1, parseInt(opts.limit || '10', 10) || 10);

  const url = `https://medium.com/_/api/tags/${encodeURIComponent(tag)}/stream`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' },
  });
  const raw = await res.text();

  if (!res.ok || /Attention Required|Just a moment|cf-challenge/i.test(raw)) {
    throw new Error(
      `medium.com blocked the request (HTTP ${res.status}, Cloudflare bot protection). ` +
        'The internal API endpoint is not reachable from this network.'
    );
  }

  let json;
  try {
    json = JSON.parse(raw.replace(XSSI, ''));
  } catch {
    throw new Error('medium API returned non-JSON (endpoint dead or format changed)');
  }

  const items = extractPosts(json).slice(0, limit);
  if (!items.length) {
    throw new Error('medium API returned no parseable posts — payload structure changed or tag has no stream');
  }
  return { total: items.length, items, tag };
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
  const cols = ['title', 'subtitle', 'url', 'author', 'claps', 'published_at'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...items.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const format = String(args.format || 'json').toLowerCase();
    try {
      const { items, total, tag } = await scrape({ tag: args.tag, limit: args.limit });
      const out = format === 'csv' ? toCsv(items) : JSON.stringify({ total, tag, items }, null, 2);
      if (args.out) {
        require('fs').writeFileSync(String(args.out), out);
        console.log(`wrote ${total} posts (tag: ${tag}) -> ${args.out}`);
      } else {
        process.stdout.write(out);
      }
    } catch (e) {
      console.error('error:', e.message);
      process.exit(1);
    }
  })();
}
