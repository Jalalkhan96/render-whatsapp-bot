'use strict';

/**
 * Live DaFont search adapter based on the user's supplied fontfinder.cjs scraper.
 * This module is used only by -fontwebsearch; normal commands read Turso.
 */
const axios = require('axios');

const BASE = 'https://www.dafont.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const http = axios.create({
  timeout: 25000,
  maxRedirects: 5,
  headers: { 'User-Agent': UA, Referer: `${BASE}/`, Accept: 'text/html,application/xhtml+xml' },
});

function parseSearch(html, query = '') {
  const fonts = [];
  const seen = new Set();
  const re = /<a href="([a-z0-9_\-]+\.font)"><strong>([^<]+)<\/strong><\/a>([\s\S]{0,800}?)(?:Free for personal use|100% Free|Demo|Shareware|Donationware|Free for commercial use)/gi;
  for (const match of String(html || '').matchAll(re)) {
    const href = match[1];
    const name = match[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    const block = match[3] || '';
    const authorMatch = block.match(/by <a href="([^"]+)">([^<]+)<\/a>/i);
    const licenseMatch = match[0].match(/(Free for personal use|100% Free|Demo|Shareware|Donationware|Free for commercial use)/i);
    const pageUrl = `${BASE}/${href}`;
    if (!name || seen.has(pageUrl)) continue;
    seen.add(pageUrl);
    fonts.push({
      id: `web-${seen.size}`,
      name,
      author: authorMatch ? authorMatch[2].replace(/&amp;/g, '&').trim() : '',
      license: licenseMatch ? licenseMatch[1] : 'Unknown',
      category: query ? `Live search: ${query}` : 'Live search',
      url: pageUrl,
      download_url: `https://dl.dafont.com/dl/?f=${href.replace(/\.font$/i, '').replace(/-/g, '_')}`,
      source: 'dafont',
    });
  }
  return fonts;
}

async function searchDaFont(query, limit = 10) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) throw new Error('Enter a font search query.');
  const response = await http.get(`${BASE}/search.php`, { params: { q } });
  const rows = parseSearch(response.data, q).slice(0, Math.min(Math.max(Number(limit) || 10, 1), 10));
  return { rows, source: 'DaFont live search', query: q };
}

module.exports = { searchDaFont, _test: { parseSearch } };
