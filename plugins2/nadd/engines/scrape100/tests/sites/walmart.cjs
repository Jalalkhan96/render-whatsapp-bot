'use strict';
// Per-site test for walmart (Walmart). Run: node tests/sites/walmart.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('walmart').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
