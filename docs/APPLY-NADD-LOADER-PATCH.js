'use strict';
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || 'lib/commandHandler.js';
let s = fs.readFileSync(file, 'utf8');
if (!s.includes("NADD_ENGINE_PREFIX")) {
  s = s.replace("const path = require('path');", "const path = require('path');\nconst NADD_ENGINE_PREFIX = 'plugins2/nadd/engines/';");
  const needle = "const full = path.join(dir, ent.name);\n";
  const repl = needle + "      const rel = path.relative(path.join(__dirname, '..'), full).replace(/\\\\/g, '/');\n      if (rel.startsWith(NADD_ENGINE_PREFIX)) continue;\n";
  if (!s.includes(needle)) throw new Error('commandHandler.js shape not recognized');
  s = s.replace(needle, repl);
  fs.writeFileSync(file, s);
  console.log('NADD loader patch applied.');
} else {
  console.log('NADD loader patch already present.');
}
