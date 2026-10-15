const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'data', 'bot-config.json');
const CANONICAL_PREFIX = '-';

function validPrefix(value) {
  const prefix = String(value || '');
  return prefix.length >= 1 && prefix.length <= 3 && !/[\s\p{Cc}]/u.test(prefix);
}

function readConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (config && typeof config === 'object') return { ...config, prefix: CANONICAL_PREFIX };
  } catch {}
  return { prefix: CANONICAL_PREFIX };
}

let current = CANONICAL_PREFIX;
readConfig();

function getPrefix() { return current; }

function setPrefix(value) {
  const prefix = String(value || '').trim();
  if (prefix !== CANONICAL_PREFIX) throw new Error('The bot command prefix is fixed to - .');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ prefix: CANONICAL_PREFIX }, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, file);
  current = CANONICAL_PREFIX;
  return current;
}

module.exports = { getPrefix, setPrefix, validPrefix, configFile: file };
