'use strict';
// Per-site test for medium (Medium). Run: node tests/sites/medium.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('medium').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
