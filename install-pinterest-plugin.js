'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceRoot = __dirname;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, `.pinterest-plugin-backup-${stamp}`);

const files = [
  ['plugins2/pindl.js', path.join(sourceRoot, 'plugins2', 'pindl.js')],
  ['lib/pinterestDownloader.js', path.join(sourceRoot, 'lib', 'pinterestDownloader.js')],
];

for (const [relative, source] of files) {
  const target = path.join(root, relative);

  if (!fs.existsSync(source)) {
    throw new Error(`Plugin source missing: ${source}`);
  }

  if (fs.existsSync(target)) {
    const backupPath = path.join(backup, relative);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(target, backupPath);
    console.log(`↳ Backup: ${relative}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`✓ Installed: ${relative}`);
}

// Do not overwrite the bot's package.json.
// This plugin intentionally uses Node 18+ fetch and has no axios dependency.
const pkgPath = path.join(root, 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const major = Number(String(pkg.engines?.node || '').match(/\d+/)?.[0] || 0);

    if (major && major < 18) {
      console.warn(`⚠️ package.json declares Node ${pkg.engines.node}; plugin requires Node 18+.`);
    }
  } catch (_) {
    console.warn('⚠️ Could not parse package.json; no changes were made.');
  }
}

console.log('\n✅ Pinterest Video Downloader installed.');
if (fs.existsSync(backup)) console.log(`📦 Backup: ${backup}`);

console.log('\nRequired .env variables:');
console.log('APIFY_TOKEN_1=...');
console.log('APIFY_TOKEN_2=...');
console.log('...');
console.log('APIFY_TOKEN_10=...');

console.log('\nOptional:');
console.log('PINTEREST_VIDEO_ACTOR=maximedupre~pinterest-video-downloader');

console.log('\nRestart the bot and test:');
console.log('-pindl <Pinterest Pin URL>');
