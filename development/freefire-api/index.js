const axios = require('axios');

const TIMEOUT = Number(process.env.FF_API_TIMEOUT_MS) || 8000;
const ITEM_SOURCE = 'https://raw.githubusercontent.com/iamaanahmad/FreeFireItems/main/data/ItemData.json';

function withParams(template, params) {
  return String(template || '').replace(/\{(uid|region|keyword|server|key)\}/gi, (_, key) =>
    encodeURIComponent(String(params[key.toLowerCase()] || ''))
  );
}

function upstream(name) {
  return process.env[name] || '';
}

function errorPayload(error) {
  const status = error.response?.status;
  return {
    success: false,
    error: status ? `Upstream API returned HTTP ${status}.` : (error.code === 'ECONNABORTED' ? 'Upstream API timed out.' : error.message),
    brand: 'ABIX-AE'
  };
}

function register(app) {
  app.get('/freefire/health', (req, res) => {
    res.json({
      success: true,
      service: 'ABIX-AE Free Fire API',
      routes: ['/freefire/info', '/freefire/ban', '/freefire/search', '/freefire/items']
    });
  });

  app.get('/freefire/info', async (req, res) => {
    const uid = String(req.query.uid || '').trim();
    const region = String(req.query.region || 'ind').trim().toLowerCase();
    const endpoint = upstream('FF_UPSTREAM_INFO_API') || upstream('FF_INFO_API_REMOTE');
    if (!/^\d{6,15}$/.test(uid)) return res.status(400).json({ success: false, error: 'Valid UID required.', brand: 'ABIX-AE' });
    if (!endpoint) return res.status(503).json({ success: false, error: 'FF_UPSTREAM_INFO_API is not configured.', brand: 'ABIX-AE' });
    try {
      const response = await axios.get(withParams(endpoint, { uid, region, key: process.env.FF_API_KEY }), {
        params: endpoint.includes('{') ? undefined : { uid, region, key: process.env.FF_API_KEY },
        timeout: TIMEOUT,
        headers: { Accept: 'application/json', 'User-Agent': 'ABIX-AE-FreeFire/1.0' }
      });
      return res.status(response.status).json(response.data);
    } catch (error) {
      return res.status(error.response?.status >= 400 ? error.response.status : 502).json(errorPayload(error));
    }
  });

  app.get('/freefire/ban', async (req, res) => {
    const uid = String(req.query.uid || '').trim();
    const endpoint = upstream('FF_UPSTREAM_BAN_API') || upstream('FF_BAN_API_REMOTE');
    if (!/^\d{6,15}$/.test(uid)) return res.status(400).json({ success: false, error: 'Valid UID required.', brand: 'ABIX-AE' });
    if (!endpoint) return res.status(503).json({ success: false, error: 'FF_UPSTREAM_BAN_API is not configured.', brand: 'ABIX-AE' });
    try {
      const response = await axios.get(withParams(endpoint, { uid, key: process.env.FF_API_KEY }), {
        params: endpoint.includes('{') ? undefined : { uid, key: process.env.FF_API_KEY },
        timeout: TIMEOUT,
        headers: { Accept: 'application/json', 'User-Agent': 'ABIX-AE-FreeFire/1.0' }
      });
      return res.status(response.status).json(response.data);
    } catch (error) {
      return res.status(error.response?.status >= 400 ? error.response.status : 502).json(errorPayload(error));
    }
  });

  app.get('/freefire/search', async (req, res) => {
    const keyword = String(req.query.keyword || '').trim();
    const server = String(req.query.server || 'IND').trim().toUpperCase();
    const endpoint = upstream('FF_UPSTREAM_SEARCH_API') || upstream('FF_SEARCH_API_REMOTE');
    if (keyword.length < 3) return res.status(400).json({ success: false, error: 'Keyword must be at least 3 characters.', brand: 'ABIX-AE' });
    if (!endpoint) return res.status(503).json({ success: false, error: 'FF_UPSTREAM_SEARCH_API is not configured.', brand: 'ABIX-AE' });
    try {
      const response = await axios.get(withParams(endpoint, { keyword, server, key: process.env.FF_API_KEY }), {
        params: endpoint.includes('{') ? undefined : { keyword, server, key: process.env.FF_API_KEY },
        timeout: TIMEOUT,
        headers: { Accept: 'application/json', 'User-Agent': 'ABIX-AE-FreeFire/1.0' }
      });
      return res.status(response.status).json(response.data);
    } catch (error) {
      return res.status(error.response?.status >= 400 ? error.response.status : 502).json(errorPayload(error));
    }
  });

  app.get('/freefire/items', async (req, res) => {
    try {
      const response = await axios.get(ITEM_SOURCE, { timeout: TIMEOUT, headers: { Accept: 'application/json' } });
      return res.json({ success: true, data: response.data, brand: 'ABIX-AE' });
    } catch (error) {
      return res.status(502).json(errorPayload(error));
    }
  });
}

module.exports = { register };
