// Tiny JSON store for the channel watchlist.
const fs = require('fs');
const path = require('path');

function loadStore(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { channels: Array.isArray(d.channels) ? d.channels : [] };
  } catch (_) {
    return { channels: [] };
  }
}

function saveStore(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const normChannel = (s) => String(s || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\/(s\/)?/, '').split('/')[0].split('?')[0].toLowerCase();

module.exports = { loadStore, saveStore, normChannel };
