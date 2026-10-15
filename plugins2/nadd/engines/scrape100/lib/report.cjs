'use strict';
/* Final JSON run report generator (MASTER PROMPT §38). */
const fs = require('fs');
const path = require('path');
const config = require('./config.cjs');
const log = require('./logger.cjs');

function writeReport(summary) {
  const file = path.join(config.dataDir, `report-${summary.runId}.json`);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(summary, null, 2));
    log.info('report.written', { file });
  } catch (err) { log.error('report.write', { err: err.message }); }
  return file;
}

function printSummary(summary) {
  console.log('\n===== RUN REPORT =====');
  console.log(`runId:      ${summary.runId}`);
  console.log(`started:    ${summary.startedAt}`);
  console.log(`finished:   ${summary.finishedAt}`);
  console.log(`total:      ${summary.totalSites}`);
  console.log(`successful: ${summary.successful}`);
  console.log(`degraded:   ${summary.degraded}`);
  console.log(`failed:     ${summary.failed}`);
  console.log(`found:      ${summary.recordsFound}`);
  console.log(`saved:      ${summary.recordsSaved}`);
  console.log(`duplicates: ${summary.duplicates}`);
  const bad = summary.sites.filter(s => s.status !== 'success');
  if (bad.length) {
    console.log('\nNon-success sites:');
    for (const s of bad) console.log(`  ${s.site}: ${s.status} — ${s.reason}`);
  }
  console.log('======================\n');
}

module.exports = { writeReport, printSummary };
