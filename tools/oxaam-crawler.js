#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const mod = require('../plugins2/oxaam');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return process.argv[i + 1] || fallback;
}

const url = arg('--url', 'https://www.oxaam.com/');
const limit = Math.max(1, Number.parseInt(arg('--limit', '100'), 10) || 100);
const out = arg('--out', path.join(process.cwd(), 'data', 'oxaam-public.json'));

(async () => {
  console.log(`[OXAAM] Public crawl: ${url}`);
  console.log(`[OXAAM] Limit: ${limit}`);
  const result = await mod.public.crawl(url, limit);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`[OXAAM] Pages: ${result.totals.pages}`);
  console.log(`[OXAAM] Articles: ${result.totals.articles}`);
  console.log(`[OXAAM] Images: ${result.totals.images}`);
  console.log(`[OXAAM] Links: ${result.totals.links}`);
  console.log(`[OXAAM] Services: ${result.totals.services}`);
  console.log(`[OXAAM] External sites: ${result.totals.externalSites}`);
  console.log(`[OXAAM] Errors: ${result.errors.length}`);
  console.log(`[OXAAM] JSON: ${out}`);
})().catch(error => {
  console.error('[OXAAM] Fatal:', error.message);
  process.exitCode = 1;
});
