'use strict';
/** Zero-dependency HTTP API for the image engine. PORT env, default 3000. */
const http = require('http');
const url = require('url');
const { ImageSearchEngine } = require('../lib/engine.js');
const registry = require('../lib/registry.js');

const engine = new ImageSearchEngine();

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = url.parse(req.url, true);
    if (u.pathname === '/search' && req.method === 'GET') {
      const q = u.query.q || '';
      if (!q) return send(res, 400, { error: 'q required' });
      const out = await engine.search(q, {
        command: u.query.type || 'image',
        maxResults: parseInt(u.query.limit, 10) || undefined,
      });
      return send(res, 200, out);
    }
    if (u.pathname === '/image' && req.method === 'GET') {
      if (!u.query.source || !u.query.id) return send(res, 400, { error: 'source and id required' });
      const img = await engine.getImage(u.query.id, u.query.source);
      return send(res, 200, img);
    }
    if (u.pathname === '/download' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      if (!body.source || !body.id) return send(res, 400, { error: 'source and id required' });
      const img = await engine.getImage(body.id, body.source);
      const dl = await engine.downloadImage(img, {});
      return send(res, 200, { ...dl, license: img.license, licenseUrl: img.licenseUrl });
    }
    if (u.pathname === '/health' && req.method === 'GET') {
      return send(res, 200, engine.healthSummary());
    }
    if (u.pathname === '/sources' && req.method === 'GET') {
      return send(res, 200, registry.all().map((s) => ({
        id: s.id, name: s.name, type: s.type, transport: s.transport,
        enabled: s.enabled, priority: s.priority, requiresKey: s.requiresKey,
        endpointVerified: s.endpointVerified, docsUrl: s.docsUrl,
      })));
    }
    return send(res, 404, { error: 'not found', routes: ['GET /search?q=&type=&limit=', 'GET /image?source=&id=', 'POST /download', 'GET /health', 'GET /sources'] });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e).slice(0, 500) });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`image-intelligence-engine API on :${PORT}`));
module.exports = { server };
