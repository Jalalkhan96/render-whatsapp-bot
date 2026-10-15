'use strict';
/* testAllSites(): sequential per-site tests → "100 total / X passed / Y degraded / Z failed".
 * `npm test` entry. Exit code 0 unless a real code bug (failed) exists. */
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry.cjs');
const { runSiteTest } = require('./siteTest.cjs');

async function testAllSites() {
  const sites = registry.listSites();
  const results = [];
  let i = 0;
  for (const s of sites) {
    i++;
    process.stdout.write(`[${String(i).padStart(3, '0')}/${sites.length}] ${s.id.padEnd(16)} ... `);
    const r = await runSiteTest(s.id);
    results.push(r);
    process.stdout.write(`${r.status.toUpperCase()} (${r.records} rec, ${r.ms}ms) ${r.note.slice(0, 80)}\n`);
  }
  const passed = results.filter(r => r.status === 'passed').length;
  const degraded = results.filter(r => r.status === 'degraded').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`\n${results.length} total / ${passed} passed / ${degraded} degraded / ${failed} failed`);
  const reportFile = path.join(__dirname, '..', 'data', `test-report-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    console.log(`report: ${reportFile}`);
  } catch (_) {}
  if (failed > 0) {
    console.log('\nFAILED (code bugs — must fix):');
    for (const r of results.filter(r => r.status === 'failed')) console.log(`  ${r.id}: ${r.note}`);
  }
  return { total: results.length, passed, degraded, failed, results };
}

if (require.main === module) {
  testAllSites().then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch(err => { console.error('test harness error:', err.message); process.exit(2); });
}

module.exports = { testAllSites };
