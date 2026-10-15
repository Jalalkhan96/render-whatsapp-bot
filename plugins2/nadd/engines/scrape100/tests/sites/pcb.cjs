'use strict';
// Per-site test for pcb (PCB). Run: node tests/sites/pcb.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('pcb').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
