'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const gameEngine = fs.readFileSync(path.join(root, 'plugins2/wa-tricks/wa-trick-games.cjs'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'lib/commandHandler.js'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'plugins2/wa-tricks/arcade-games.cjs'), 'utf8');

assert.ok(/function renderSvgNoCache\s*\(/.test(gameEngine), 'renderSvgNoCache definition missing');
assert.ok(/renderSvgNoCache\(menuSvg\(prefix\)\)/.test(gameEngine), 'games menu does not use shared renderer');
assert.ok(/function arcadeTextMenu\s*\(/.test(gameEngine), 'plain text menu fallback missing');
assert.ok(/function sendGame\s*\(/.test(gameEngine), 'sendGame missing');
assert.ok(/Native HTML unavailable/.test(gameEngine), 'native HTML fallback path missing');
assert.ok(/Interactive fallback unavailable/.test(gameEngine), 'interactive fallback path missing');
assert.ok(/NATIVE_ARCADE_COMMANDS/.test(loader), 'arcade loader priority set missing');
assert.ok(/NATIVE_ARCADE_COMMANDS\.has\(command\) && source\.startsWith\('plugins2\/'\)\) return -1;/.test(loader), 'plugins2 arcade priority missing');
const commandMatches = catalog.match(/\{ cmd: '/g) || [];
assert.strictEqual(commandMatches.length, 31, `Expected 31 arcade games, found ${commandMatches.length}`);
assert.ok(/command:\s*'acceptall'/.test(fs.readFileSync(path.join(root, 'plugins2/acceptall.js'), 'utf8')), 'acceptall command missing');
console.log('✅ Game regression checks passed: renderer, menu fallbacks, loader priority, 31-game catalog, acceptall present.');
