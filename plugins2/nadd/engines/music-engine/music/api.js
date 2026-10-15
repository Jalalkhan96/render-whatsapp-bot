'use strict';
/**
 * HTTP API for the music engine — zero-dependency (node:http).
 * Endpoints (spec #99):
 *   GET /api/music/search?q=        GET /api/music/song?q=
 *   GET /api/music/lyrics?q=        GET /api/music/find?q=
 *   GET /api/music/artist?q=        GET /api/music/album?q=
 *   GET /api/music/meaning?q=       GET /api/music/facts?q=
 *   GET /api/music/translate?q=&language=
 *   GET /api/music/trending?country=   GET /api/music/charts?country=
 *   GET /api/music/new               POST /api/music/identify (JSON {audioBase64, mime})
 *   GET /api/music/health            GET /api/music/sources
 *
 * Standalone:  node music/api.js   (PORT env, default 3100)
 * Express mount: app.use('/api/music', require('./music/api').expressRouter());
 */
const http = require('http');
const { URL } = require('url');
const MusicManager = require('./music-manager');
const searchEngine = require('./search-engine');
const registry = require('./source-registry');
const health = require('./health-manager');

const manager = new MusicManager();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 8 * 1024 * 1024) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

async function route(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const path = u.pathname.replace(/\/$/, '');
  const q = (u.searchParams.get('q') || '').trim();

  try {
    if (path === '/api/music/search' || path === '/api/music/song') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await manager.search(q, { lyrics: true }));
    }
    if (path === '/api/music/lyrics') {
      if (!q) return json(res, 400, { error: 'missing q' });
      const r = await manager.search(q, { lyrics: true });
      return json(res, 200, { query: q, match: r.match, lyrics: r.lyrics });
    }
    if (path === '/api/music/find') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await searchEngine.searchByLyricsFragment(q));
    }
    if (path === '/api/music/artist') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await manager.getArtist(q));
    }
    if (path === '/api/music/album') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await manager.getAlbum(q));
    }
    if (path === '/api/music/meaning') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await manager.getMeaning(q));
    }
    if (path === '/api/music/facts') {
      if (!q) return json(res, 400, { error: 'missing q' });
      return json(res, 200, await manager.getFacts(q));
    }
    if (path === '/api/music/translate') {
      const language = (u.searchParams.get('language') || '').trim();
      if (!q || !language) return json(res, 400, { error: 'missing q or language' });
      const r = await manager.search(q, { lyrics: true });
      const trs = r.match.title ? await manager.findTranslations({ title: r.match.title, artist: r.match.artist }, language) : [];
      return json(res, 200, { query: q, language, match: r.match, translations: trs });
    }
    if (path === '/api/music/trending') {
      return json(res, 200, await manager.getTrending(u.searchParams.get('country') || undefined));
    }
    if (path === '/api/music/charts') {
      return json(res, 200, await manager.getCharts(u.searchParams.get('country') || undefined));
    }
    if (path === '/api/music/new') {
      return json(res, 200, { releases: await manager.getNewReleases({ country: u.searchParams.get('country') || 'global' }) });
    }
    if (path === '/api/music/identify' && req.method === 'POST') {
      const body = await readBody(req);
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'invalid JSON' }); }
      if (!parsed.audioBase64) return json(res, 400, { error: 'missing audioBase64' });
      const buf = Buffer.from(parsed.audioBase64, 'base64');
      return json(res, 200, await manager.identifyAudio(buf, parsed.mime || 'audio/ogg'));
    }
    if (path === '/api/music/health') {
      return json(res, 200, { health: health.list() });
    }
    if (path === '/api/music/sources') {
      return json(res, 200, { sources: registry.list() });
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, 500, { error: String((err && err.message) || err).slice(0, 300) });
  }
}

/** Express-compatible router (optional — only used if the host app has express). */
function expressRouter() {
  // Lazy: only require express when actually mounted in an express app.
  const express = require('express');
  const router = express.Router();
  router.use(express.json({ limit: '8mb' }));
  router.use(async (req, res) => {
    const fakeReq = Object.assign(req, { url: '/api/music' + req.path + (req._parsedUrl && req._parsedUrl.search ? req._parsedUrl.search : '') });
    await route(fakeReq, res);
  });
  return router;
}

function start(port) {
  const p = port || parseInt(process.env.PORT || '3100', 10);
  const server = http.createServer(route);
  server.listen(p, () => {
    // eslint-disable-next-line no-console
    console.log('music-engine API listening on :' + p);
  });
  return server;
}

if (require.main === module) start();

module.exports = { route, start, expressRouter, manager };
