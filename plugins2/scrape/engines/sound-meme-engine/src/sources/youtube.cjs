'use strict';

/**
 * sources/youtube.cjs — YouTube search-page scrape (no API key).
 * Parses the server-rendered `ytInitialData` JSON for videoRenderer
 * entries. METADATA + OFFICIAL LINKS ONLY — this tool never downloads
 * from YouTube (no ripping, ever).
 * License: unknown (YouTube user uploads).
 */
const http = require('../http.cjs');
const { termHits } = require('../query.cjs');
const { unknown } = require('../license.cjs');

function extractInitialData(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('youtube: ytInitialData not found (page shape changed or blocked)');
  return JSON.parse(m[1]);
}

function parseDuration(s) {
  if (!s) return null;
  const parts = String(s).split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseViews(s) {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function runsText(node) {
  return ((node && node.runs) || []).map((r) => r.text || '').join('');
}

function collectVideos(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectVideos(v, out);
    return;
  }
  if (node && typeof node === 'object') {
    if (node.videoRenderer) {
      const vr = node.videoRenderer;
      const videoId = vr.videoId;
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        out.push({
          id: `youtube:${videoId}`,
          source: 'youtube',
          kind: 'video-link',
          title: runsText(vr.title) || '(untitled)',
          mediaUrl: null,
          pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
          author: runsText(vr.ownerText) || runsText(vr.longBylineText) || null,
          durationSec: parseDuration(vr.lengthText && vr.lengthText.simpleText),
          views: parseViews(vr.viewCountText && vr.viewCountText.simpleText),
          published: vr.publishedTimeText && vr.publishedTimeText.simpleText,
          downloadable: false,
          license: unknown('YouTube user upload — watch on youtube.com'),
        });
      }
      return; // don't descend into player guts
    }
    for (const v of Object.values(node)) collectVideos(v, out);
  }
}

async function search(q, opts) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q.original);
  const html = await http.fetchText(url, opts);
  const data = extractInitialData(html);
  const out = [];
  collectVideos(data, out);
  // keep only term-relevant hits
  return out.filter((v) => q.terms.length === 0 || termHits(q, v.title) > 0)
    .map((v) => ({ ...v, _termHits: termHits(q, v.title) }));
}

module.exports = {
  name: 'youtube',
  status: 'live',
  auth: 'none',
  search,
  // exported for tests
  extractInitialData, parseDuration, parseViews, collectVideos,
};
