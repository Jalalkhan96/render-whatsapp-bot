'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildNativeHtmlGame, inspectNativeHtmlGame, HTML_PRIMITIVE } = require('./lib/richHtmlGame.cjs');
const { GAMES } = require('./plugins2/wa-tricks/wa-trick-games.cjs');

for (const game of GAMES) {
  const file = path.join(__dirname, 'plugins2', 'wa-tricks', 'games', game.file);
  assert.ok(fs.existsSync(file), `Missing game file: ${game.file}`);
  const html = fs.readFileSync(file, 'utf8').replaceAll('{{PFP}}', '');
  const audit = inspectNativeHtmlGame(html);
  assert.equal(audit.ok, true, `${game.cmd}: HTML too large/empty`);
  assert.equal(audit.hasRemoteResource, false, `${game.cmd}: unexpected remote resource`);

  const payload = buildNativeHtmlGame(html, { title: game.name });
  assert.ok(payload.botForwardedMessage, `${game.cmd}: missing botForwardedMessage`);
  const raw = payload.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
  const unified = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  const primitive = unified.sections[0].view_model.primitive;
  assert.equal(primitive.__typename, HTML_PRIMITIVE);
  assert.equal(primitive.payload, html);
}

console.log(`✅ Native game self-test passed: ${GAMES.length} games`);
