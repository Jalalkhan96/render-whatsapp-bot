import pg from 'pg';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('database');
const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Prevents an idle client error from crashing the whole process.
  log.error({ err: err.message }, 'Unexpected error on idle PostgreSQL client');
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      log.warn({ duration, text: text.slice(0, 80) }, 'Slow query');
    }
    return result;
  } catch (err) {
    log.error({ err: err.message, text: text.slice(0, 120) }, 'Database query failed');
    throw err;
  }
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    log.error({ err: err.message }, 'Database health check failed');
    return false;
  }
}

export async function closeDatabase() {
  await pool.end();
}
