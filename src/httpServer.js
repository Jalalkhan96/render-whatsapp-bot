import express from 'express';
import { config } from './config.js';
import { checkDatabaseConnection } from './database/database.js';
import { getConnectionStatus } from './whatsapp/connection.js';
import { childLogger } from './utils/logger.js';

const log = childLogger('http');

export function startHealthServer() {
  const app = express();

  app.get('/health', async (req, res) => {
    const dbOk = await checkDatabaseConnection();
    const wa = getConnectionStatus();
    const healthy = dbOk && wa === 'connected';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      whatsapp: wa,
      database: dbOk ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
    });
  });

  const server = app.listen(config.http.port, () => {
    log.info({ port: config.http.port }, 'Health check server listening');
  });

  return server;
}
