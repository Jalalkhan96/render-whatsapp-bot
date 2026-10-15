'use strict';
/**
 * Bollywood Hungama adapter — India (regional-platforms).
 * Verified live 2026-10-05: WordPress-style search is server-rendered at
 *   https://www.bollywoodhungama.com/?s=<query>
 * Results are music NEWS articles (<article class="bh-box-article ..."> with
 * h3.entry-title > a and time[datetime]). There is no track catalog here, so
 * results are returned as news items with extra.kind='news'.
 */
const { fetchText, sleep } = require('../http');
const { cleanText, openGraph, durationToMs } = require('../html');

const META = {
  id: 'bollywood-hungama', name: 'Bollywood Hungama', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en'],
  searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 10, needsKey: null,
  baseUrl: 'https://www.bollywoodhungama.com', enabled: true,
};

const searchUrl = (q) => 'https://www.bollywoodhungama.com/?s=' + encodeURIComponent(q);

function thumbOf(article) {
  const m = /<img[^>]*data-src="([^"]+)"|<img[^>]*src="(https?:\/\/[^"]+)"/i.exec(article);
  if (!m) return null;
  const src = m[1] || m[2];
  return src && !src.startsWith('data:') ? src : null;
}

function parseArticles(html, query, limit) {
  const out = [];
  const re = /<article[^>]*class="[^"]*bh-box-article[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const art = m[1];
    const linkM = /<h3[^>]*class="entry-title[^"]*"[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i.exec(art)
      || /<h3[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i.exec(art);
    if (!linkM) continue;
    const url = linkM[1].split('?utm_source=')[0];
    const title = cleanText(linkM[2] !== undefined && linkM[2] !== linkM[3] ? linkM[2] : linkM[linkM.length - 1]);
    if (!title) continue;
    const timeM = /<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i.exec(art);
    const dateStr = timeM ? cleanText(timeM[1]) : '';
    const cover = thumbOf(art);
    out.push({
      title,
      artist: '',
      artists: [],
      album: '',
      durationMs: null,
      releaseDate: dateStr || null,
      year: dateStr ? parseInt(dateStr.slice(-4), 10) || null : null,
      isrc: null,
      genre: null,
      language: 'en',
      cover,
      label: 'Bollywood Hungama',
      writers: [],
      producers: [],
      url,
      sourceId: url.split('/').filter(Boolean).pop() || null,
      source: 'bollywood-hungama',
      extra: { kind: 'news', query },
    });
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchText(searchUrl(q), { retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'Bollywood Hungama search timed out' };
    return { status: 'error', results: [], note: 'Bollywood Hungama search HTTP ' + r.status };
  }
  return { status: 'ok', results: parseArticles(r.text, q, limit) };
}

async function lookup(urlOrId, opts = {}) {
  const s = String(urlOrId || '').trim();
  const m = /(https?:\/\/www\.bollywoodhungama\.com\/[^\s"']+)/i.exec(s);
  if (!m) return null;
  const page = m[1];
  const r = await fetchText(page, { retries: 1 });
  if (!r.ok) return null;
  const og = openGraph(r.text);
  const title = cleanText(og['og:title'] || '');
  if (!title) return null;
  const pubM = /article:published_time" content="([^"]+)"/i.exec(r.text);
  const pub = pubM ? pubM[1] : '';
  return {
    title,
    artist: '',
    artists: [],
    album: '',
    durationMs: null,
    releaseDate: pub || null,
    year: pub ? parseInt(pub.slice(0, 4), 10) || null : null,
    isrc: null,
    genre: null,
    language: 'en',
    cover: og['og:image'] || null,
    label: 'Bollywood Hungama',
    writers: [],
    producers: [],
    url: og['og:url'] || page,
    sourceId: page.split('/').filter(Boolean).pop() || null,
    source: 'bollywood-hungama',
    extra: { kind: 'news' },
  };
}

async function health() {
  const t = Date.now();
  const r = await fetchText(searchUrl('Pasoori'), { retries: 0 });
  return {
    status: r.ok ? 'ok' : 'error',
    latencyMs: Date.now() - t,
    note: r.ok ? 'search page reachable (HTTP 200)' : 'search page HTTP ' + r.status,
  };
}

module.exports = { META, search, lookup, health };
