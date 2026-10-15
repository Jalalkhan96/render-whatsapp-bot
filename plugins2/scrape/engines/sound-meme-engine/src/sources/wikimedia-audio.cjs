'use strict';

/**
 * sources/wikimedia-audio.cjs — Wikimedia Commons filetype:audio search.
 * The only downloadable source: every file carries machine-readable
 * license metadata. Unknown/unparseable -> `unknown`, never free.
 */
const http = require('../http.cjs');
const { termHits } = require('../query.cjs');
const { fromWikimedia } = require('../license.cjs');
const config = require('../config.cjs');

const API = 'https://commons.wikimedia.org/w/api.php';

function isAudioUrl(u) {
  const clean = String(u || '').split('?')[0].toLowerCase();
  return config.audioExts.some((ext) => clean.endsWith(ext));
}

async function search(q, opts) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${q.searchText} filetype:audio`,
    gsrnamespace: '6',
    gsrlimit: String(Math.min((opts.limit || config.defaultLimit) + 10, 50)),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
  });
  const data = await http.fetchJson(`${API}?${params.toString()}`, opts);
  const pages = (data && data.query && data.query.pages) || {};
  const out = [];
  for (const page of Object.values(pages)) {
    const ii = page.imageinfo && page.imageinfo[0];
    if (!ii || !ii.url || !isAudioUrl(ii.url)) continue;
    const title = String(page.title || '')
      .replace(/^File:/, '')
      .replace(/\.(ogg|oga|wav|mp3|flac|m4a|opus)$/i, '')
      .replace(/_/g, ' ');
    const hits = termHits(q, title);
    if (q.terms.length > 0 && hits === 0) continue;
    const lic = fromWikimedia(ii.extmetadata);
    out.push({
      id: `wikimedia-audio:${page.pageid}`,
      source: 'wikimedia-audio',
      kind: 'audio',
      title,
      mediaUrl: ii.url.split('?')[0],
      pageUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      author: lic.attribution ? lic.attribution.split(' / ')[0] : null,
      durationSec: null,
      views: 0,
      downloadable: true,
      license: lic,
      _termHits: hits,
    });
  }
  return out;
}

module.exports = { name: 'wikimedia-audio', status: 'live', auth: 'none', search };
