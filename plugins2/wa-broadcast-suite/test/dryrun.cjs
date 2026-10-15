// Dry-run test: campaign engine logic with a fake sender (no WhatsApp needed).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { sleep } = require('../lib/util.cjs');
const { Campaign, renderTemplate } = require('../lib/campaign.cjs');
const { saveExcel, readFirstSheet } = require('../lib/util.cjs');
const { Survey } = require('../lib/survey.cjs');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-test-'));

  // 1) template rendering
  assert.strictEqual(renderTemplate('Hi {name}, code {code}!', { name: 'Ali', code: '42' }), 'Hi Ali, code 42!');
  assert.strictEqual(renderTemplate('Hi {name}!', {}), 'Hi !');
  console.log('ok: renderTemplate');

  // 2) Excel round-trip + contact loading (with a duplicate + a bad row)
  const xlsxFile = path.join(tmp, 'contacts.xlsx');
  saveExcel(xlsxFile, { Contacts: [
    { phone: '923001111111', name: 'Ali' },
    { phone: '923002222222', name: 'Sara' },
    { phone: '923001111111', name: 'Ali Dup' },
    { phone: 'abc', name: 'Bad' },
    { phone: '923003333333', name: 'Omar' },
  ]});
  const rows = readFirstSheet(xlsxFile);
  assert.strictEqual(rows.length, 5);
  console.log('ok: excel round-trip');

  const camp = new Campaign('test1', tmp);
  const n = camp.loadContacts(rows);
  assert.strictEqual(n, 3, 'expected 3 unique valid contacts, got ' + n);
  console.log('ok: loadContacts dedupe/validation');

  // 3) campaign run with fake lines + fake sender, tiny delays
  const usedLines = [];
  const lines = [
    { id: 'line1', ready: true, sock: {} },
    { id: 'line2', ready: true, sock: {} },
  ];
  const send = async (line, jid, content) => {
    usedLines.push(line.id);
    assert.ok(content.text.includes('Ali') || content.text.includes('Sara') || content.text.includes('Omar'));
    await sleep(5);
    return { messageId: 'mid-' + jid };
  };
  const events = [];
  const summary = await camp.start({
    send, lines,
    message: 'Hello {name}, this is a test.',
    delayMin: 0.01, delayMax: 0.02, batchSize: 2, batchPauseSec: 0.05,
    onEvent: (e) => events.push(e.type),
  });
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.sent, 3);
  assert.strictEqual(summary.failed, 0);
  assert.strictEqual(camp.status, 'done');
  assert.ok(usedLines.includes('line1') && usedLines.includes('line2'), 'round-robin should use both lines: ' + usedLines);
  assert.ok(events.includes('batch-pause'), 'batch pause event expected');
  assert.ok(events.includes('done'));
  console.log('ok: campaign run (delays, batching, round-robin)');

  // 4) receipts
  const mid = camp.results[0].messageId;
  assert.ok(camp.markReceipt(mid, 'delivered'));
  assert.ok(camp.markReceipt(mid, 'read'));
  assert.strictEqual(camp.summary().read, 1);
  assert.strictEqual(camp.markReceipt('nope', 'read'), false);
  console.log('ok: receipt tracking');

  // 5) resume-safety: re-run skips already-sent
  let sends2 = 0;
  await camp.start({ send: async () => { sends2++; return { messageId: 'x' }; }, lines, message: 'Hi', delayMin: 0, delayMax: 0, batchSize: 0, onEvent: () => {} });
  assert.strictEqual(sends2, 0, 'resume should skip sent contacts');
  console.log('ok: resume-safe');

  // 6) pause/stop
  const camp2 = new Campaign('test2', tmp);
  camp2.loadContacts([{ phone: '923009999999', name: 'Zed' }]);
  camp2.pause(); // pause before start is a no-op guard
  camp2.stop();
  assert.strictEqual(camp2.status, 'stopped');
  console.log('ok: stop');

  // 7) survey record/next/report
  const s = new Survey('sv1', ['Q1?', 'Q2?'], 1);
  s.target(['923001111111@s.whatsapp.net']);
  assert.strictEqual(s.nextQuestion('923001111111@s.whatsapp.net'), 'Q1?');
  assert.ok(s.record('923001111111@s.whatsapp.net', 'answer one'));
  assert.strictEqual(s.nextQuestion('923001111111@s.whatsapp.net'), 'Q2?');
  assert.ok(s.record('923001111111@s.whatsapp.net', 'answer two'));
  assert.strictEqual(s.remaining, 0);
  assert.strictEqual(s.answers.length, 2);
  assert.ok(!s.record('923009999999@s.whatsapp.net', 'intruder'));
  console.log('ok: survey flow');

  console.log('\nAll dry-run tests passed.');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error('TEST FAILED:', e); process.exit(1); });
