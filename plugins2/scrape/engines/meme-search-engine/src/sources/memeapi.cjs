'use strict';

/**
 * sources/memeapi.cjs — https://meme-api.com (Reddit-backed, key-free).
 * Direct Reddit JSON blocks datacenter IPs; meme-api proxies it.
 *
 * Strategy: pull N newest posts from each target subreddit, then filter by
 * query terms in the title client-side. Pepe queries additionally target
 * r/pepethefrog (a real, active subreddit — verified live).
 * License: unknown (Reddit UGC).
 */
const http = require('../http.cjs');
const { termHits } = require('../query.cjs');
const { unknown } = require('../license.cjs');
const config = require('../config.cjs');

const BASE = 'https://meme-api.com/gimme';
const GENERAL_SUBS = ['memes', 'dankmemes', 'meme', 'me_irl', 'AdviceAnimals'];
const PEPE_SUBS = ['pepethefrog', 'dankmemes', 'memes'];

function pickSubs(q) {
  return q.isPepe ? PEPE_SUBS : GENERAL_SUBS;
}

function isImageUrl(u) {
  const clean = String(u || '').split('?')[0].toLowerCase();
  return config.imageExts.some((ext) => clean.endsWith(ext));
}

function looksNsfw(title) {
  const t = String(title || '').toLowerCase();
  return config.nsfwTerms.some((term) => t.includes(term));
}

async function search(q, opts) {
  const subs = pickSubs(q);
  const perSub = Math.max(5, Math.ceil((opts.limit || config.defaultLimit) / subs.length) + 5);
  const out = [];
  for (const sub of subs) {
    let data;
    try {
      data = await http.fetchJson(`${BASE}/${sub}/${perSub}`, opts);
    } catch (err) {
      // one dead subreddit must not kill the whole search
      continue;
    }
    const memes = (data && data.memes) || [];
    for (const m of memes) {
      if (!m.url || !isImageUrl(m.url)) continue;
      if (m.nsfw && !opts.nsfw) continue;
      if (!opts.nsfw && looksNsfw(m.title)) continue;
      const hits = termHits(q, `${m.title} ${sub}`);
      if (q.terms.length > 0 && hits === 0) continue;
      out.push({
        id: `memeapi:${sub}:${String(m.postLink || '').split('/').pop() || m.url}`,
        source: 'memeapi',
        title: m.title || '(untitled)',
        imageUrl: m.url,
        pageUrl: m.postLink || `https://www.reddit.com/r/${sub}`,
        author: m.author || null,
        ups: typeof m.ups === 'number' ? m.ups : 0,
        nsfw: !!m.nsfw,
        width: null,
        height: null,
        license: unknown('Reddit user post via meme-api; check the post page'),
        _termHits: hits,
        _sub: sub,
      });
    }
  }
  return out;
}

module.exports = {
  name: 'memeapi',
  status: 'live',
  auth: 'none',
  search,
  pickSubs, // exported for tests
};
