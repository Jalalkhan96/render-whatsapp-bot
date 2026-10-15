'use strict';
const plugin = require('./plugins/font-downloader.js');
if (plugin.command !== 'font') throw new Error('canonical font command missing');
for (const alias of ['fontmenu','fonturdu','fontlanguage','fontname','fontrandom']) {
  if (!plugin.aliases.includes(alias)) throw new Error(`missing alias ${alias}`);
}
if (typeof plugin._test?.safeFileName !== 'function') throw new Error('font self-test helpers missing');
if (plugin._test.safeFileName('A/B:C?.ttf') !== 'A_B_C_.ttf') throw new Error('safeFileName regression');
console.log('✅ font plugin self-test passed');
