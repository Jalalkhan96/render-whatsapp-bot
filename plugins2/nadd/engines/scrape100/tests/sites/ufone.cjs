'use strict';
// Per-site test for ufone (Ufone). Run: node tests/sites/ufone.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('ufone').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
