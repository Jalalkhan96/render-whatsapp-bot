'use strict';

// Runs from npm's preinstall lifecycle, before npm reifies dependencies.
// Abix can leave npm's temporary rename directories behind after an
// interrupted install, causing ENOTEMPTY on the next startup, e.g.
//   node_modules/axios -> node_modules/.axios-XXXXXX
//   node_modules/acrcloud -> node_modules/.acrcloud-XXXXXX
// Remove only those npm-style temporary rename directories. Do NOT delete
// normal packages, .bin, .package-lock.json, caches, or application files.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');

const TEMP_NAME = /^\.[^.]+-[A-Za-z0-9_-]{6,}$/;
const DELETE_NAME = /^\.[^.]+\.DELETE(?:-[A-Za-z0-9_-]+)?$/;

function cleanDirectory(dir) {
  if (!fs.existsSync(dir)) return 0;

  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.startsWith('.')) continue;
    if (entry.name === '.bin' || entry.name === '.package-lock.json') continue;
    if (!TEMP_NAME.test(entry.name) && !DELETE_NAME.test(entry.name)) continue;

    const target = path.join(dir, entry.name);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      removed++;
      console.log(`[PREINSTALL] Removed stale npm temp directory: ${path.relative(root, target)}`);
    } catch (error) {
      console.warn(`[PREINSTALL] Could not remove ${path.relative(root, target)}: ${error.message}`);
    }
  }
  return removed;
}

const removed = cleanDirectory(nodeModules);

// Also handle scoped packages: node_modules/@scope/.package-XXXXXX
if (fs.existsSync(nodeModules)) {
  for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('@')) continue;
    cleanDirectory(path.join(nodeModules, entry.name));
  }
}

console.log(`[PREINSTALL] npm temp cleanup complete (${removed} top-level temp dirs removed).`);
