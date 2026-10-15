#!/usr/bin/env node
'use strict';
const { Command } = require('commander');
const registry = require('../src/index.cjs');

const program = new Command();
program.name('pdfsuite').description('Node.js port of the iLovePDF conversion system').version('1.0.0');

for (const [name, tool] of Object.entries(registry)) {
  if (!tool || !tool.command) continue; // skip non-tool exports like `util`
  const cmd = program.command(tool.command).description(tool.description);
  for (const [flags, desc, def] of tool.options || []) {
    if (def !== undefined && def !== null) cmd.option(flags, desc, def);
    else cmd.option(flags, desc);
  }
  cmd.action(async (...args) => {
    const opts = args[args.length - 1].opts();
    const positionals = args.slice(0, -1);
    try {
      const msg = await tool.action(...positionals, opts);
      if (msg) console.log(msg);
    } catch (e) {
      console.error(`Error (${name}): ${e.message}`);
      process.exit(1);
    }
  });
}

program.parse(process.argv);
if (!process.argv.slice(2).length) program.outputHelp();
