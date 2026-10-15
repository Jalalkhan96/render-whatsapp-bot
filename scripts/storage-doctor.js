#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const MAX_RESULTS = 20;
const TARGETS = ['node_modules', 'tmp', 'temp', 'session', 'data', 'baileys_store.json', 'data/messageCount.json', 'error.log'];

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, value = n;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 2 : 0)} ${units[i]}`;
}

function statSize(target) {
  try { return fs.statSync(target).isFile() ? fs.statSync(target).size : 0; } catch { return 0; }
}

function dirSize(target, limitMs = 3000) {
  const started = Date.now();
  let total = 0;
  let files = 0;
  const stack = [target];
  const seen = new Set();
  while (stack.length && Date.now() - started < limitMs) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const st = fs.lstatSync(full);
        if (st.isSymbolicLink()) continue;
        const key = `${st.dev}:${st.ino}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (st.isDirectory()) stack.push(full);
        else if (st.isFile()) { total += st.size; files++; }
      } catch {}
    }
  }
  return { bytes: total, files, complete: stack.length === 0 };
}

function diskStats(target) {
  try {
    const st = fs.statfsSync(target);
    const total = st.blocks * st.bsize;
    const available = st.bavail * st.bsize;
    return { total, available, used: Math.max(0, total - available) };
  } catch { return null; }
}

console.log('=== ABIX STORAGE DOCTOR ===');
console.log(`Root: ${ROOT}`);
console.log(`Node: ${process.version} | PID: ${process.pid}`);

const disk = diskStats(ROOT);
if (disk) {
  const pct = disk.total ? ((disk.used / disk.total) * 100).toFixed(1) : 'n/a';
  console.log(`Disk: ${formatBytes(disk.used)} used / ${formatBytes(disk.total)} total (${pct}%) | ${formatBytes(disk.available)} free`);
  if (disk.available < 256 * 1024 * 1024) console.log('⚠️ CRITICAL: less than 256 MB disk space is available.');
  else if (disk.available < 1024 * 1024 * 1024) console.log('⚠️ WARNING: less than 1 GB disk space is available.');
}

const mem = process.memoryUsage();
console.log(`RAM: RSS ${formatBytes(mem.rss)} | heap ${formatBytes(mem.heapUsed)}/${formatBytes(mem.heapTotal)} | external ${formatBytes(mem.external)} | ArrayBuffers ${formatBytes(mem.arrayBuffers || 0)}`);

for (const relative of TARGETS) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) continue;
  try {
    const st = fs.statSync(absolute);
    if (st.isFile()) console.log(`${relative}: ${formatBytes(st.size)}`);
    else {
      const result = dirSize(absolute);
      console.log(`${relative}/: ${formatBytes(result.bytes)} in ${result.files} files${result.complete ? '' : ' (scan timed out)'}`);
    }
  } catch {}
}

function collectTopFiles(root) {
  const results = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length && results.length < 50000) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        const st = fs.lstatSync(full);
        if (st.isSymbolicLink()) continue;
        const key = `${st.dev}:${st.ino}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (st.isDirectory()) {
          if (!['node_modules/.cache', '.git'].some(skip => full.includes(path.sep + skip))) stack.push(full);
        } else if (st.isFile()) results.push({ full, size: st.size });
      } catch {}
    }
  }
  return results.sort((a, b) => b.size - a.size).slice(0, MAX_RESULTS);
}

console.log('\nTop files:');
for (const item of collectTopFiles(ROOT)) {
  console.log(`${formatBytes(item.size).padStart(10)}  ${path.relative(ROOT, item.full)}`);
}

const ffmpeg = (() => {
  try { require('../lib/ffmpegPath').getFfmpegPath(); return require('../lib/ffmpegPath').getFfmpegPath(); }
  catch { return null; }
})();
console.log(`\nFFmpeg: ${ffmpeg || 'NOT FOUND'}`);
console.log(`Platform: ${os.platform()}/${os.arch()}`);
