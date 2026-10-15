-- Link Intelligence Engine schema (PostgreSQL-flavored, portable to SQLite)
CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  input_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  provider TEXT,
  final_url TEXT,
  status TEXT NOT NULL,
  risk TEXT,
  hop_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS redirect_hops (
  id SERIAL PRIMARY KEY,
  link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
  hop_number INTEGER NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  location TEXT,
  hostname TEXT,
  https BOOLEAN,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS link_sources (
  id SERIAL PRIMARY KEY,
  provider_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS link_checks (
  id SERIAL PRIMARY KEY,
  link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
  http_status INTEGER,
  tls_ok BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS link_safety (
  id SERIAL PRIMARY KEY,
  link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
  risk TEXT NOT NULL,
  signals TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- value_hash only: raw token values are NEVER stored
CREATE TABLE IF NOT EXISTS link_tracking (
  id SERIAL PRIMARY KEY,
  link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL,
  type TEXT NOT NULL,
  value_hash CHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS link_provider_health (
  id SERIAL PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  average_latency_ms INTEGER,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS link_scrape_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  sources_total INTEGER,
  sources_ok INTEGER,
  sources_failed INTEGER,
  note TEXT
);
