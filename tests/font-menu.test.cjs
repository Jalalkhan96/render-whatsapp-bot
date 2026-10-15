'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../plugins/font-downloader.js'), 'utf8');
const match = source.match(/function menu\(prefix\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, 'menu function should exist');
const menu = vm.runInNewContext(`(${match[0]})`);
const output = menu('-');
for (const text of [
  '*ABIX FONT STUDIO*', '_Search • Download • Discover_',
  '`-font horror`', '`-font random`', '`-font urdu`', '`-font lang arabic`',
  '`-font type serif`', '`-font license free`', '`-font types`',
  '`-dafont horror`', '`-gfonts horror`', '`-fontshare horror`',
  '`-urbanfonts horror`', '`-fontspace horror`', '`-freefonts horror`',
  '`-wfonts horror`', '`-abstractfonts horror`', '`-fontsquirrel horror`',
  '`-fontwebsearch horror`', '`-fd 1`', '`-fd 1,3,5`', '`-fd all`',
  '`-font stats`', '`-font sites`', '*DIRECT FILE DELIVERY*'
]) assert.ok(output.includes(text), `menu missing ${text}`);
assert.ok(output.includes('\n'), 'menu should use real newlines');
assert.ok(!output.includes('Preparing 10 file(s)'), 'menu must not include progress text');
assert.ok(menu('!').includes('`!font random`'), 'custom prefix should be respected');
console.log('Font Studio menu formatting and command coverage passed.');
