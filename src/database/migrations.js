import { pool, closeDatabase } from './database.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('migrations');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  jid TEXT UNIQUE NOT NULL,
  name TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  daily_request_count INTEGER NOT NULL DEFAULT 0,
  daily_count_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'direct', -- 'direct' | 'group'
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_active
  ON conversations(user_id, is_active);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_message_id TEXT,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, timestamp);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id
  ON messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  jid TEXT UNIQUE NOT NULL,
  name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'approved_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function migrate() {
  log.info('Running database migrations...');
  await pool.query(SCHEMA);
  log.info('Migrations completed successfully.');
  await closeDatabase();
  process.exit(0);
}

migrate().catch((err) => {
  log.error({ err: err.message }, 'Migration failed');
  process.exit(1);
});
