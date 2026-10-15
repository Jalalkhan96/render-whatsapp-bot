'use strict';

/**
 * sources/wikimedia.cjs — Wikimedia Commons file search.
 * The ONLY source whose results can be labeled `free`: every file carries
 * machine-readable license metadata (LicenseShortName / LicenseUrl).
 * Unknown/unparseable licenses are demoted to `unknown` — never free.
 */
const http = require('../http.cjs');
const { termHits } = require('../query.cjs');
const { fromWikimedia } = require('../license.cjs');
const config = require('../config.cjs');

const API = 'https://commons.wikimedia.org/w/api.php';

function buildUrl(q, limit) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: q.searchText,
    gsrnamespace: '6', // File namespace only
    gsrlimit: String(Math.min(limit, 50)),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1200',
  });
  return `${API}?${params.toString()}`;
}

async function search(q, opts) {
  const data = await http.fetchJson(buildUrl(q, (opts.limit || config.defaultLimit) + 10), opts);
  const pages = (data && data.query && data.query.pages) || {};
  const out = [];
  for (const page of Object.values(pages)) {
    const ii = page.imageinfo && page.imageinfo[0];
    if (!ii || !ii.url) continue;
    const title = String(page.title || '').replace(/^File:/, '').replace(/\.(jpg|jpeg|png|gif|webp)$/i, '').replace(/_/g, ' ');
    const hits = termHits(q, title);
    if (q.terms.length > 0 && hits === 0) continue;
    const lic = fromWikimedia(ii.extmetadata);
    const pageUrl = ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;
    out.push({
      id: `wikimedia:${page.pageid}`,
      source: 'wikimedia',
      title,
      imageUrl: ii.url,
      pageUrl,
      author: lic.attribution ? lic.attribution.split(' / ')[0] : null,
      ups: 0,
      nsfw: false,
      width: ii.width || null,
      height: ii.height || null,
      license: lic,
      _termHits: hits,
    });
  }
  return out;
}

module.exports = {
  name: 'wikimedia',
  status: 'live',
  auth: 'none',
  search,
};
