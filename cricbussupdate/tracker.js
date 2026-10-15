const fs = require('fs');
const path = require('path');
const { fetchCommentary } = require('./scraper');

const FILE = path.join(__dirname, 'data', 'trackers.json');
const timers = new Map();

function read() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function write(value) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function key(chatId, match) {
  return `${chatId}:${match}`;
}

function list(chatId) {
  return Object.values(read()).filter(item => item.chatId === chatId);
}

async function start(chatId, match, notify, intervalMs = 60_000) {
  const id = key(chatId, match);
  const state = read();
  state[id] = { chatId, match, startedAt: new Date().toISOString(), intervalMs };
  write(state);
  if (timers.has(id)) clearInterval(timers.get(id));
  const poll = async () => {
    try {
      const result = await fetchCommentary(match);
      const current = read()[id];
      const latest = result.lines.join('\n');
      if (current && latest !== current.latest) {
        const next = read();
        next[id] = { ...current, latest, checkedAt: new Date().toISOString() };
        write(next);
        await notify(result);
      }
    } catch (error) {
      console.warn(`[CRICBUZZ] Tracker ${match} failed:`, error.message);
    }
  };
  await poll();
  timers.set(id, setInterval(poll, Math.max(30_000, intervalMs)));
  return state[id];
}

function stop(chatId, match) {
  const id = key(chatId, match);
  const state = read();
  if (!state[id]) return false;
  if (timers.has(id)) clearInterval(timers.get(id));
  timers.delete(id);
  delete state[id];
  write(state);
  return true;
}

module.exports = { start, stop, list };
