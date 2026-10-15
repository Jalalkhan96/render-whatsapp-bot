'use strict';
/**
 * pdfsuite-node — programmatic API.
 * const pdfsuite = require('pdfsuite-node');
 * await pdfsuite.merge.action(['a.pdf','b.pdf'], { output: 'out.pdf' });
 *
 * CLI defaults (the `def` column of each tool's options) are applied automatically,
 * so both CLI and programmatic calls behave identically.
 */
const fs = require('fs');
const path = require('path');

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function withDefaults(tool, args) {
  const defs = tool.options || [];
  if (!defs.length) return args;
  const last = args[args.length - 1];
  if (!last || typeof last !== 'object' || Array.isArray(last)) return args;
  const o = { ...last };
  for (const [flags, , def] of defs) {
    const m = String(flags).match(/--(no-)?([a-zA-Z][\w-]*)/);
    if (!m) continue;
    const key = camel(m[2]);
    if (m[1]) { if (o[key] === undefined) o[key] = true; } // --no-xxx flags
    else if (o[key] === undefined && def !== undefined && def !== null) o[key] = def;
  }
  return [...args.slice(0, -1), o];
}

const registry = {};
for (const f of fs.readdirSync(path.join(__dirname, 'tools'))) {
  if (!f.endsWith('.cjs')) continue;
  const tool = require(path.join(__dirname, 'tools', f));
  const name = tool.command.split(' ')[0];
  const orig = tool.action;
  tool.action = (...args) => orig(...withDefaults(tool, args));
  registry[name] = tool;
}

module.exports = registry;
module.exports.util = require('./lib/util.cjs');
