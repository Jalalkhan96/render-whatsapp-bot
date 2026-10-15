const express = require('express');
const { register } = require('./index');

const app = express();
const port = Number(process.env.PORT) || 3000;
const proxyKey = String(process.env.FF_PROXY_KEY || '').trim();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  if (req.path === '/freefire/health' || !proxyKey) return next();
  const supplied = req.get('x-api-key') || req.query.key || '';
  if (supplied !== proxyKey) {
    return res.status(401).json({ success: false, error: 'Invalid API key.', brand: 'ABIX-AE' });
  }
  return next();
});

register(app);

app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'ABIX-AE Free Fire API',
    routes: ['/freefire/health', '/freefire/info', '/freefire/ban', '/freefire/search', '/freefire/items'],
    protected: Boolean(proxyKey),
    brand: 'ABIX-AE'
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[ABIX-AE] Free Fire API listening on port ${port}`);
});
