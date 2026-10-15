const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const POSTGRES_URL = process.env.POSTGRES_URL;
const FILE = path.join(process.cwd(), 'data', 'giveaways.json');
let pool = null;
let initialized = false;

function normalize(row) {
  if (!row) return null;
  return {
    giveaway_id: row.giveaway_id,
    group_jid: row.group_jid,
    creator_jid: row.creator_jid,
    prize: row.prize,
    winner_count: Number(row.winner_count),
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    participants: Array.isArray(row.participants) ? row.participants : (typeof row.participants === 'string' ? JSON.parse(row.participants || '[]') : []),
    winners: Array.isArray(row.winners) ? row.winners : (typeof row.winners === 'string' ? JSON.parse(row.winners || '[]') : []),
  };
}

function ensureFile() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', { mode: 0o600 });
}

function readFile() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { return {}; }
}

function writeFile(data) {
  ensureFile();
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, FILE);
}

async function init() {
  if (initialized) return;
  if (POSTGRES_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: POSTGRES_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
    pool.on('error', err => console.error('[GIVEAWAY DB]', err.message));
    await pool.query(`
      CREATE TABLE IF NOT EXISTS giveaways (
        giveaway_id TEXT PRIMARY KEY,
        group_jid TEXT NOT NULL,
        creator_jid TEXT NOT NULL,
        prize TEXT NOT NULL,
        winner_count INTEGER NOT NULL CHECK (winner_count > 0),
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        participants JSONB NOT NULL DEFAULT '[]'::jsonb,
        winners JSONB NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_giveaways_group_status ON giveaways(group_jid, status);
      CREATE INDEX IF NOT EXISTS idx_giveaways_end_time ON giveaways(end_time);
    `);
  } else {
    ensureFile();
  }
  initialized = true;
}

async function create({ groupJid, creatorJid, prize, winnerCount, durationMinutes }) {
  await init();
  const id = crypto.randomUUID();
  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  if (pool) {
    const { rows } = await pool.query(`
      INSERT INTO giveaways (giveaway_id, group_jid, creator_jid, prize, winner_count, start_time, end_time, status, participants, winners)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'active','[]'::jsonb,'[]'::jsonb)
      RETURNING *
    `, [id, groupJid, creatorJid, prize, winnerCount, start, end]);
    return normalize(rows[0]);
  }
  const data = readFile();
  const row = { giveaway_id: id, group_jid: groupJid, creator_jid: creatorJid, prize, winner_count: winnerCount, start_time: start.toISOString(), end_time: end.toISOString(), status: 'active', participants: [], winners: [] };
  data[id] = row;
  writeFile(data);
  return row;
}

async function get(id) {
  await init();
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM giveaways WHERE giveaway_id=$1 LIMIT 1', [id]);
    return normalize(rows[0]);
  }
  return readFile()[id] || null;
}

async function activeAll() {
  await init();
  if (pool) {
    const { rows } = await pool.query(`SELECT * FROM giveaways WHERE status='active' ORDER BY end_time ASC`);
    return rows.map(normalize);
  }
  return Object.values(readFile()).filter(row => row.status === 'active');
}

async function activeForGroup(groupJid) {
  await init();
  if (pool) {
    const { rows } = await pool.query(`SELECT * FROM giveaways WHERE group_jid=$1 AND status='active' ORDER BY start_time DESC LIMIT 1`, [groupJid]);
    return normalize(rows[0]);
  }
  const row = Object.values(readFile()).filter(item => item.group_jid === groupJid && item.status === 'active').sort((a,b) => new Date(b.start_time) - new Date(a.start_time))[0];
  return row || null;
}

async function addParticipant(id, jid) {
  await init();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM giveaways WHERE giveaway_id=$1 FOR UPDATE', [id]);
      const row = normalize(rows[0]);
      if (!row || row.status !== 'active') { await client.query('ROLLBACK'); return { ok: false, reason: 'inactive', giveaway: row }; }
      if (row.participants.includes(jid)) { await client.query('ROLLBACK'); return { ok: false, reason: 'already', giveaway: row }; }
      row.participants.push(jid);
      const result = await client.query('UPDATE giveaways SET participants=$2::jsonb WHERE giveaway_id=$1 RETURNING *', [id, JSON.stringify(row.participants)]);
      await client.query('COMMIT');
      return { ok: true, reason: 'added', giveaway: normalize(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  const data = readFile();
  const row = data[id];
  if (!row || row.status !== 'active') return { ok: false, reason: 'inactive', giveaway: row || null };
  row.participants ||= [];
  if (row.participants.includes(jid)) return { ok: false, reason: 'already', giveaway: row };
  row.participants.push(jid);
  writeFile(data);
  return { ok: true, reason: 'added', giveaway: row };
}

async function finish(id, status = 'ended') {
  await init();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM giveaways WHERE giveaway_id=$1 FOR UPDATE', [id]);
      const row = normalize(rows[0]);
      if (!row || row.status !== 'active') { await client.query('ROLLBACK'); return row; }
      let winners = [];
      if (status === 'ended' && row.participants.length) {
        const poolEntries = [...new Set(row.participants)];
        while (winners.length < Math.min(row.winner_count, poolEntries.length)) {
          const index = crypto.randomInt(poolEntries.length);
          winners.push(poolEntries.splice(index, 1)[0]);
        }
      }
      const result = await client.query(`UPDATE giveaways SET status=$2, winners=$3::jsonb WHERE giveaway_id=$1 RETURNING *`, [id, status, JSON.stringify(winners)]);
      await client.query('COMMIT');
      return normalize(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const data = readFile();
  const row = data[id];
  if (!row || row.status !== 'active') return row || null;
  const entries = [...new Set(row.participants || [])];
  const winners = [];
  if (status === 'ended') {
    while (winners.length < Math.min(row.winner_count, entries.length)) winners.push(entries.splice(crypto.randomInt(entries.length), 1)[0]);
  }
  row.status = status;
  row.winners = winners;
  writeFile(data);
  return row;
}

async function cancel(id) { return finish(id, 'cancelled'); }

async function expireDue() {
  await init();
  if (pool) {
    const { rows } = await pool.query(`SELECT giveaway_id FROM giveaways WHERE status='active' AND end_time <= NOW()`);
    const ended = [];
    for (const row of rows) ended.push(await finish(row.giveaway_id, 'ended'));
    return ended;
  }
  const data = readFile();
  const due = Object.values(data).filter(row => row.status === 'active' && new Date(row.end_time).getTime() <= Date.now());
  const ended = [];
  for (const row of due) {
    row.status = 'ended';
    const entries = [...new Set(row.participants || [])];
    row.winners = [];
    while (row.winners.length < Math.min(Number(row.winner_count), entries.length)) row.winners.push(entries.splice(crypto.randomInt(entries.length), 1)[0]);
    ended.push(row);
  }
  if (due.length) writeFile(data);
  return ended;
}

module.exports = { init, create, get, activeAll, activeForGroup, addParticipant, finish, cancel, expireDue };
