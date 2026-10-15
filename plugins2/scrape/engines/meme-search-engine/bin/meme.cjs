#!/usr/bin/env node
'use strict';

/**
 * bin/meme.cjs — CLI
 *
 *   node bin/meme.cjs search "pepe the frog" --limit 20
 *   node bin/meme.cjs search "pepe the frog" --download --dir ./pepes
 *   node bin/meme.cjs sources
 *   node bin/meme.cjs test
 */
const fs = require('fs');
const path = require('path');
const { searchMemes, listSources } = require('../src/index.cjs');
const { format } = require('../src/output.cjs');
const { downloadAll } = require('../src/download.cjs');
const config = require('../src/config.cjs');

function usage() {
  console.log(`meme-search-engine v${config.version}
Usage:
  meme search "<query>" [--limit N] [--sources a,b] [--format json|csv|txt]
                        [--out FILE] [--download] [--dir DIR] [--nsfw] [--no-cache]
  meme sources
  meme test`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[k] = next; i++; }
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

async function cmdSearch(args) {
  const query = args._[1];
  if (!query) { console.error('error: missing query'); usage(); process.exit(1); }
  const opts = {
    limit: args.limit ? parseInt(args.limit, 10) : config.defaultLimit,
    sources: args.sources ? String(args.sources).split(',').map((s) => s.trim()) : undefined,
    nsfw: !!args.nsfw,
    noCache: !!args['no-cache'],
  };
  const results = await searchMemes(query, opts);
  const meta = results._meta;
  delete results._meta;

  if (args.download) {
    const dir = args.dir || path.join(process.cwd(), config.downloadDirName);
    const dl = await downloadAll(results, dir);
    const ok = dl.filter((d) => d.ok).length;
    console.error(`downloaded ${ok}/${dl.length} -> ${dir}`);
    for (const d of dl.filter((d) => !d.ok)) {
      console.error(`  SKIP ${d.item.title}: ${d.error}`);
    }
  }

  const out = format(results, args.format || 'json');
  if (args.out) {
    fs.writeFileSync(args.out, out);
    console.error(`wrote ${results.length} results -> ${args.out}`);
  } else {
    console.log(out);
  }
  if (Object.keys(meta.errors).length) {
    console.error('source notes: ' + JSON.stringify(meta.errors));
  }
}

async function cmdSources() {
  const health = require('../src/health.cjs').status(process.cwd());
  for (const s of listSources()) {
    const h = health[s.name];
    console.log(`${s.name.padEnd(10)} ${s.status.padEnd(14)} auth=${s.auth}` +
      (h ? `  fails=${h.fails} lastOk=${h.lastOk || 'never'}${h.lastErr ? ' lastErr=' + h.lastErr.slice(0, 80) : ''}` : ''));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  try {
    if (cmd === 'search') await cmdSearch(args);
    else if (cmd === 'sources') await cmdSources();
    else if (cmd === 'test') { require('../test/run.cjs'); }
    else { usage(); process.exit(cmd ? 1 : 0); }
  } catch (err) {
    console.error('error:', err.message);
    process.exit(1);
  }
}

main();
