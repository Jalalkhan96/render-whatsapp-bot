'use strict';

/**
 * sources/imgflip.cjs — api.imgflip.com/get_memes
 * Free, no key. Returns the 100 most-captioned templates; we filter by
 * template NAME client-side (captions need auth, we don't touch them).
 * License: unknown (Imgflip user-uploaded templates).
 */
const http = require('../http.cjs');
const { termHits } = require('../query.cjs');
const { unknown } = require('../license.cjs');

const ENDPOINT = 'https://api.imgflip.com/get_memes';

async function search(q, opts) {
  const data = await http.fetchJson(ENDPOINT, opts);
  if (!data || !data.success || !data.data || !Array.isArray(data.data.memes)) {
    throw new Error('imgflip: unexpected response shape');
  }
  const out = [];
  for (const m of data.data.memes) {
    const hits = termHits(q, m.name);
    if (q.terms.length > 0 && hits === 0) continue;
    out.push({
      id: `imgflip:${m.id}`,
      source: 'imgflip',
      title: m.name,
      imageUrl: m.url,
      pageUrl: `https://imgflip.com/memetemplate/${m.id}`,
      author: null,
      ups: typeof m.captions === 'number' ? m.captions : 0,
      nsfw: false,
      width: m.width || null,
      height: m.height || null,
      license: unknown('Imgflip user-uploaded template; check imgflip.com terms'),
      _termHits: hits,
    });
  }
  return out;
}

module.exports = {
  name: 'imgflip',
  status: 'live',
  auth: 'none',
  search,
};
