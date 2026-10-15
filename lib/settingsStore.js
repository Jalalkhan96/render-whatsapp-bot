const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'data', 'runtime-settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeSettings(settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = {
    responseDelay: Number(settings.responseDelay || 0),
    commandCooldowns: settings.commandCooldowns || {}
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  return data;
}
module.exports = { file, readSettings, writeSettings };
