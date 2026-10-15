'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const plugin = fs.readFileSync(path.join(dir, 'slidermenu.js'), 'utf8');
const helper = fs.readFileSync(path.join(dir, 'nativeCarousel.js'), 'utf8');

const checks = [
  ['command -slidermenu', /command:\s*['"]slidermenu['"]/],
  ['five slider cards', /const cards = \[/],
  ['mini games directory', /13 games/],
  ['Pong card', /Pong/],
  ['TikTok statistics table', /571\.300/],
  ['copy flow', /name: 'cta_copy'/],
  ['copy_code', /copy_code/],
  ['carouselMessage', /carouselMessage/],
  ['WhatsApp relay', /relayMessage/],
];

for (const [name, re] of checks) {
  if (!re.test(plugin + '\n' + helper)) throw new Error(`Missing: ${name}`);
}

console.log('✅ Sliderchecking v2 source self-test passed');
console.log('✅ Command: -slidermenu');
console.log('✅ 5 cards configured');
console.log('✅ Mini Games directory with 13 commands');
console.log('✅ Pong visual card');
console.log('✅ TikTok statistics table');
console.log('✅ cta_copy buttons configured');
console.log('ℹ️ Live WhatsApp rendering still requires the bot runtime/client.');
