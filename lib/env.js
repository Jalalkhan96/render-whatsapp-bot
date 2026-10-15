'use strict';

const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  let count = 0;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) || line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
    count++;
  }
  return count;
}

function loadEnv() {
  const root = process.cwd();
  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.BOT_ENV_PATH,
    process.env.ENV_FILE,
    path.join(root, 'session.env'),
    path.join(root, '.env'),
  ].filter(Boolean);

  const loaded = [];
  for (const file of [...new Set(candidates)]) {
    if (fs.existsSync(file)) {
      parseEnvFile(file);
      loaded.push(file);
    }
  }
  return loaded;
}

module.exports = { loadEnv, parseEnvFile };
